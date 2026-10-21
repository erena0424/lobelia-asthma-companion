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
MOCK_TIPS = {"Soccer practice": "Some people with asthma like to ease in with a warm-up before hard exercise.",
"Lecture": "A calm start. Keep your rescue inhaler in your bag.",
             "Chemistry Lab": "Stepping out for fresh air is one way to take a break from strong scents or fumes.",
             "Skating": "A scarf over your nose and mouth helps warm the cold air you breathe."}

# The Today card comes from the real rules (services/today_card_service.py, stdlib only).
# Pick a card state for screenshots by writing one word to MOCK_DIR/today_state:
# none | green | yellow (default) | strong | escalate | no_plan | flagged | quick_log
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")))
from services.today_card_service import build_today_card
from services.quick_log_rollup import context_from_logs, prefill_from_logs

# Quick logs for today (made up). While MOCK_DIR/no_quick_logs exists the API shows none.
def _logs():
    return [] if os.path.exists(os.path.join(HERE, "no_quick_logs")) else STATE["quick_logs"]

def _seed_logs():
    now = datetime.datetime.now(datetime.timezone.utc).astimezone()
    at = lambda h, m: now.replace(hour=h, minute=m, second=0, microsecond=0).isoformat()
    zero = {"shortness_of_breath": 0, "chest_tightness": 0, "wheezing": 0, "coughing": 0}
    return [{"id": "q1", "logged_at": at(8, 5), "local_date": TODAY, "breathing": dict(zero), "limiting_activity": None, "reliever_puffs": 0, "triggers": [], "note": None},
            {"id": "q3", "logged_at": at(11, 40), "local_date": TODAY, "breathing": dict(zero, coughing=2), "limiting_activity": None, "reliever_puffs": 0, "triggers": [], "note": None},
            {"id": "q2", "logged_at": at(14, 10), "local_date": TODAY, "breathing": dict(zero, wheezing=5, coughing=2), "limiting_activity": None, "reliever_puffs": 2, "triggers": ["Exercise"], "note": "After the stairs"}]
STATE["quick_logs"] = _seed_logs()

def _today_state():
    try:
        with open(os.path.join(HERE, "today_state")) as f: return f.read().strip() or "yellow"
    except OSError: return "yellow"

def _mock_check_ins(state, day):
    d = datetime.date.fromisoformat(day); y = (d - datetime.timedelta(days=1)).isoformat()
    calm = {"breathing_0_to_10": {}, "night_waking": False, "activity_limitation": False, "reliever_puffs": 0}
    rough = {"breathing_0_to_10": {"wheezing": 5, "coughing": 2}, "night_waking": True, "activity_limitation": False, "reliever_puffs": 2}
    if state == "quick_log":
        return [context_from_logs(_logs(), d, sum(l["reliever_puffs"] for l in _logs()))] if _logs() else []
    if state == "none": return []
    if state == "green": return [dict(calm, date=y)]
    if state == "strong": return [dict(rough, date=y, breathing_0_to_10={"shortness of breath": 8}, activity_limitation=True)]
    if state == "escalate": return [dict(rough, date=y), dict(rough, date=day, breathing_0_to_10={"chest tightness": 6})]
    return [dict(calm, date=(d - datetime.timedelta(days=3)).isoformat()), dict(rough, date=y)]

def day_plan(day):
    state = _today_state()
    environment = {"pollen": "Moderate", "aqi_band": 1, "aqi_label": "Good", "temperature_f": 41, "temperature_high_f": 52,
                   "temperature_low_f": 31, "humidity_pct": 64}
    if state == "flagged":
        environment.update(pollen="High", aqi_band=3, aqi_label="Unhealthy for sensitive groups")
    card = build_today_card(check_ins=_mock_check_ins(state, day), today=datetime.date.fromisoformat(day),
                            action_plan=None if state == "no_plan" else PROFILE["action_plan"],
                            environment=environment, triggers=PROFILE["trigger_preferences"])
    events = [dict(e, tip=e.get("tip") or MOCK_TIPS.get(e["title"], "Keep your rescue inhaler with you.")) for e in STATE["events"].get(day, [])]
    summary = None if state == "escalate" else "Your evening skate is in cold air. A scarf over your nose and mouth helps warm the air you breathe."
    return {"date": day, "timezone": "America/Chicago", "source": "fixed" if state == "escalate" else "ai",
            "environment": environment, "summary": summary, "events": events, "today": card}

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
        if p.startswith("/v1/symptom-logs"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            if p == "/v1/symptom-logs/prefill":
                day = q.get("date", [TODAY])[0]
                logs = [l for l in _logs() if l["local_date"] == day]
                puffs = sum(l["reliever_puffs"] for l in logs)
                return self._send(200, {"date": day, **prefill_from_logs(logs, puffs, int(q.get("tz_offset", ["0"])[0]))})
            lo = q.get("from", [TODAY])[0]; hi = q.get("to", [lo])[0]
            return self._send(200, {"items": [l for l in _logs() if lo <= l["local_date"] <= hi]})
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
        if p == "/v1/symptom-logs":
            log = {"id": f"q{len(STATE['quick_logs']) + 1}-{int(time.time())}", "local_date": b.get("local_date") or TODAY,
                   "logged_at": b.get("logged_at"), "breathing": b.get("breathing") or {}, "limiting_activity": b.get("limiting_activity"),
                   "reliever_puffs": b.get("reliever_puffs") or 0, "triggers": b.get("triggers") or [], "note": b.get("note")}
            STATE["quick_logs"].append(log)
            return self._send(201, log)
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
        if self.path.startswith("/v1/symptom-logs/"):
            log_id = self.path.rsplit("/", 1)[-1]
            STATE["quick_logs"] = [l for l in STATE["quick_logs"] if l["id"] != log_id]
        self._send(204)
    def do_PATCH(self):
        b = self._body(); self._record(b)
        PROFILE.update({k: v for k, v in b.items() if v is not None})
        self._send(200, PROFILE)

ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
