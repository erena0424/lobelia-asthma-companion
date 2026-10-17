const dashboardBase = "";

export const urls = {
  landing: "/",
  login: "/login",
  signup: "/signup",
  setup: "/setup",
  privacy: "/privacy",
  sources: "/sources",

  dashboard: dashboardBase,
  home: `${dashboardBase}/home`,
  statistics: `${dashboardBase}/statistics`,
  calendar: `${dashboardBase}/calendar`,
  profile: `${dashboardBase}/profile`,
  chat: `${dashboardBase}/chat`,
  help: `${dashboardBase}/help`,
  checkIn: `${dashboardBase}/check-in`,
};

export const BREAKPOINTS = {
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400,
};

export const loginFields = [
  {
    name: "email",
    label: "Email",
    type: "text",
    placeholder: "Enter your email",
    error: (input, inputs) => {
      if (!input) {
        return "Email is required.";
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
        return "Enter a valid email address.";
      }

      return "";
    }
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "Enter your password",
    error: (input, inputs) => {
      if (!input) {
        return "Password is required.";
      }

      if (!/[a-z]/.test(input)) {
        return "Password must contain a lowercase letter.";
      }

      if (!/[A-Z]/.test(input)) {
        return "Password must contain an uppercase letter.";
      }

      if (!/\d/.test(input)) {
        return "Password must contain a number.";
      }

      if (!/[^A-Za-z0-9]/.test(input)) {
        return "Password must contain a special character.";
      }

      if(input.length < 8) {
        return "Password must be at least 8 characters."
      }

      return "";
    }
  },
];

export const signUpFields = [
  ...loginFields,
  {
    name: "confirmPassword",
    label: "Confirm Password",
    type: "password",
    placeholder: "Re-enter your password",
    error: (input, inputs) => {
      if(inputs.password != input) {
        return "Passwords do not match.";
      }

      return "";
    }
  },
];

export const loginState = {
  email: "",
  password: "",
}

export const signUpState = {
  ...loginState,
  confirmPassword: ""
}

export const profileFields = [
  {
    name: "name",
    label: "Name",
    type: "text",
    placeholder: "Enter your preferred name",
    error: (input, inputs) => {
      if (!input.trim()) {
        return "Name is required.";
      }

      return "";
    }
  },
  {
    name: "date_of_birth",
    label: "Birthday",
    type: "date",
    placeholder: "Enter your birthday",
    error: (input, inputs) => {
      if (!input) {
        return "Birthday is required.";
      }
    
      const birthday = new Date(input);
      const today = new Date();

      // Ignore the current time when comparing
      today.setHours(0, 0, 0, 0);

      if (birthday > today) {
        return "Birthday cannot be in the future.";
      }

      return "";
    }
  }
];

export const profileState = {
  name: "",
  date_of_birth: ""
}

export const contactState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
};

export const contactFields = [
  {
      name: "firstName",
      label: "First Name",
      type: "text",
      placeholder: "Enter first name",
      error: (value) => {
          if (!value.trim()) return "First name is required.";
          return "";
      }
  },
  {
      name: "lastName",
      label: "Last Name",
      type: "text",
      placeholder: "Enter last name",
      error: () => ""
  },
  {
      name: "phone",
      label: "Phone Number",
      type: "tel",
      placeholder: "(XXX) XXX-XXXX",
      error: (value) => {
          if (!value) return "Phone number is required.";

          const regex = /^\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}$/;

          if (!regex.test(value)) {
              return "Invalid phone number.";
          }

          return "";
      }
  },
  {
      name: "email",
      label: "Email",
      type: "email",
      placeholder: "email@email.com",
      error: (value) => {
          if (!value) return "";

          const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

          if (!regex.test(value)) {
              return "Invalid email.";
          }

          return "";
      }
  }
];

export const asthmaTriggers = [
  "Dust",
  "Pollen",
  "Pet dander",
  "Mold",
  "Smoke",
  "Cold air",
  "Exercise",
  "Stress",
  "Strong smells",
  "Air pollution",
  "Respiratory infections",
  "Weather changes"
];

export const asthmaSymptoms = [
  "Coughing",
  "Wheezing",
  "Shortness of breath",
  "Chest tightness",
  "Difficulty breathing",
  "Fatigue",
  "Trouble sleeping due to breathing issues"
];
