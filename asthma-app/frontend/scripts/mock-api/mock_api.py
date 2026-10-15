# Fake Lobelia API for UI checks only. Made-up data; no real services.
import json, os, time, base64, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.environ.get("MOCK_DIR", os.path.dirname(os.path.abspath(__file__)))
def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
TOKEN = b64({"alg":"HS256"}) + "." + b64({"sub":"demo@example.com","exp":9999999999}) + ".c2ln"
PROFILE = {"id":"u1","name":"Test User","email":"demo@example.com","date_of_birth":"1999-04-01",
  "emergency_contacts":[{"id":"c1","firstName":"Sam","lastName":"Rivera","phone":"(555) 010-2020"}],
  "trigger_preferences":["Pollen","Cold air","Exercise"],"symptoms":["Coughing","Wheezing"],"tracking":[],
  "trigger_sensitivities":{},"care_goal":None,"accessibility_needs":None,"preferred_environment":None,
  "preferred_reminder":None,"contact_method":None,
  # SAMPLE plan for the demo only; made up, not medical advice
  "action_plan":{"green":{"daily_medicines":"Controller inhaler, 1 puff morning and night (sample)"},
    "yellow":{"quick_relief_medicine":"Rescue inhaler (sample)","dose_device":"2 puffs with spacer (sample)","repeat_every_minutes":20,"max_doses":3,
              "if_not_improving":"Call my clinic the same day (sample)"},
    "red":{"quick_relief":"Use rescue inhaler now (sample)","call_clinician":"Call Dr. Lee right away (sample)","emergency":"Call 911 if lips turn blue or I can't talk (sample)"}},
  "asthma_support":{"rescue_inhaler":"Blue rescue inhaler (sample)","controller_medicines":"Controller inhaler (sample)",
    "peak_flow":{"personal_best":450,"yellow_below":360,"red_below":225},
    "clinician":{"name":"Dr. Lee (sample)","phone":"555-010-3030"},
    "urgent_care":{"name":"Campus Urgent Care (sample)","phone":"555-010-4040","address":"123 Sample St"}}}
TODAY = datetime.date.today().isoformat()
STATE = {"memory": None,
         "checkins": {}, "log": [],
         "events": {TODAY: [
            {"id": "e1", "title": "Lecture", "start": TODAY + "T10:00", "end": TODAY + "T11:15", "all_day": False, "location": "Bascom Hall", "environment": "indoor", "intensity": "light", "source": "manual"},
            {"id": "e2", "title": "Chemistry Lab", "start": TODAY + "T14:30", "end": TODAY + "T16:30", "all_day": False, "location": "Chem Building", "environment": "indoor", "intensity": "light", "context": "chemical smells", "source": "manual"},
            {"id": "e3", "title": "Skating", "start": TODAY + "T17:00", "end": TODAY + "T18:00", "all_day": False, "location": "Ice rink", "environment": "indoor", "intensity": "moderate", "context": "cold air", "source": "manual"},
         ]}}
_Y = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
_T = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
STATE["checkins"][_Y] = {"date": _Y, "symptoms_logged": True, "puffs_today": 1, "notes": "[Check-in] Feeling: Good.", "triggers": [], "daily_day_symp": False}
STATE["events"][_T] = [{"id": "e4", "title": "Soccer practice", "start": _T + "T18:00", "end": _T + "T19:30", "all_day": False, "environment": "outdoor", "intensity": "hard", "context": "cut grass", "source": "manual"}]
MOCK_TIPS = {"Soccer practice": "Freshly cut grass and hard exercise can both be triggers. Warm up slowly.",
"Lecture": "A calm start. Keep your rescue inhaler in your bag.",
             "Chemistry Lab": "Be mindful of strong scents and fumes. Step out for fresh air if your chest feels tight.",
             "Skating": "Cold air can be a trigger. A scarf over your mouth can help."}

def day_plan(day):
    events = [dict(e, tip=e.get("tip") or MOCK_TIPS.get(e["title"], "Keep your rescue inhaler with you.")) for e in STATE["events"].get(day, [])]
    return {"date": day, "timezone": "America/Chicago", "source": "ai",
            "environment": {"pollen": "Moderate", "aqi_band": 1, "aqi_label": "Good", "temperature_f": 61, "temperature_high_f": 68, "temperature_low_f": 49},
            "risk_level": "Moderate",
            "summary": "Pollen is moderate and the air is clean today. Your afternoon has a lab with strong smells and an evening skate in cold air, so keep your rescue inhaler close.",
            "events": events}

FORECAST = {"date": TODAY, "forecast_for": TODAY, "flare_probability": 0.34, "risk_level": "Moderate",
            "contributing_factors": ["Moderate pollen", "Cold air this evening"],
            "advice": {"summary": "Keep your rescue inhaler with you and take breaks if your chest feels tight.", "sections": [], "disclaimer": "Lobelia is not a medical device."}}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body=None):
        self.send_response(code)
        self.send_header("Content-Type","application/json")
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Access-Control-Allow-Credentials","true")
        self.send_header("Access-Control-Allow-Headers","*")
        self.send_header("Access-Control-Allow-Methods","*")
        self.end_headers()
        if body is not None: self.wfile.write(json.dumps(body).encode())
    def do_OPTIONS(self): self._send(200, {})
    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")
    def _record(self, b):
        STATE["log"].append({"method": self.command, "path": self.path, "body": b})
        with open(os.path.join(HERE, "mock_requests.json"), "w") as f: json.dump(STATE["log"], f, indent=1)
    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/v1/users/me":
            if os.path.exists(os.path.join(HERE, "fail_profile")): return self._send(503, {"detail":"cold"})
            return self._send(200, PROFILE)
        if p == "/v1/users/me/support-memory": return self._send(200, {"summary": STATE["memory"]})
        if p.startswith("/v1/check-ins"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            lo, hi = q.get("from", ["0000"])[0], q.get("to", ["9999"])[0]
            dates = set(STATE["checkins"]) | set(STATE["events"])
            items = []
            for d in sorted(dates):
                if lo <= d <= hi:
                    row = dict(STATE["checkins"].get(d) or {"date": d, "symptoms_logged": False, "puffs_today": 0})
                    row["symptoms_logged"] = row.get("symptoms_logged", d in STATE["checkins"])
                    row["calendar_events"] = STATE["events"].get(d, [])
                    items.append(row)
            return self._send(200, {"items": items})
        if p.startswith("/v1/calendar/status"): return self._send(200, {"connected": False})
        if p.startswith("/v1/calendar"): return self._send(200, {"events": []})
        return self._send(200, {})
    def do_POST(self):
        p = self.path.split("?")[0]; b = self._body(); self._record(b)
        if p == "/v1/auth/login":
            if b.get("email","").startswith("slow"): return self._send(503, {"detail":"unavailable"})
            return self._send(200, {"access_token": TOKEN})
        if p == "/v1/feedback":
            if os.path.exists(os.path.join(HERE, "fail_feedback")): return self._send(502, {"detail": "send failed"})
            with open(os.path.join(HERE, "mock_feedback.log"), "a") as f: f.write(json.dumps(b) + "\n")
            return self._send(202, {"status": "sent"})
        if p == "/v1/forecasts/today":
            if os.path.exists(os.path.join(HERE, "no_forecast")): return self._send(200, {"today": None, "tomorrow": None})
            return self._send(200, {"today": FORECAST, "tomorrow": None})
        if p == "/v1/day-plan": return self._send(200, day_plan(b.get("date") or TODAY))
        if p == "/v1/calendar/manual-events":
            day = b.get("date") or TODAY
            STATE["events"][day] = b.get("events", [])
            return self._send(201, {"date": day, "events": STATE["events"][day]})
        if p == "/v1/check-ins":
            STATE["checkins"][b.get("date")] = {**b, "puffs_today": 0, "symptoms_logged": True}
            return self._send(201, STATE["checkins"][b.get("date")])
        if p.startswith("/v1/companion"):
            if os.path.exists(os.path.join(HERE, "fail_companion")): return self._send(503, {"detail": "unavailable"})
            time.sleep(2)
            return self._send(200, {"message": "Hi! This is a mock companion reply.", "generation_status": "generated",
                                    "context_token": "mock", "history_accepted": True})
        return self._send(200, {})
    def do_PUT(self):
        p = self.path.split("?")[0]; b = self._body(); self._record(b)
        if p == "/v1/users/me/support-memory":
            STATE["memory"] = {"text": b["text"], "source": "user-reported"}
            return self._send(200, {"summary": STATE["memory"]})
        if p == "/v1/check-ins/inhaler": return self._send(200, {"puffs_today": b.get("puffs_today")})
        return self._send(200, {})
    def do_DELETE(self):
        self._record(None)
        if self.path.startswith("/v1/users/me/support-memory"): STATE["memory"] = None
        self._send(204)
    def do_PATCH(self):
        b = self._body(); self._record(b)
        PROFILE.update({k: v for k, v in b.items() if v is not None})
        self._send(200, PROFILE)

ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
