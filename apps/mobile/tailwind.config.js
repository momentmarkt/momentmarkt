/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#17120f",
        cream: "#fff8ee",
        rain: "#5b7c99",
        cocoa: "#7a3f22",
        spark: "#e30613",
      },
    },
  },
  plugins: [],
};
