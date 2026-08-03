// Merge this object into your Tailwind theme.extend configuration.
module.exports = {
  theme: {
    extend: {
      colors: {
        slateBlack: "#0B0F14",
        midnightSlate: "#11171F",
        deepSlate: "#18212B",
        slateSurface: "#222D39",
        graphiteSlate: "#344150",
        steelGray: "#566272",
        coolGray: "#7D8794",
        silverGray: "#B5BDC7",
        mistGray: "#D5DAE0",
        cloudGray: "#E9ECEF",
        softWhite: "#F6F7F9",
        status: {
          success: "#55A887",
          information: "#668FB3",
          warning: "#C59A57",
          error: "#B96568",
        },
      },
      fontFamily: {
        display: ["Manrope", "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        xs: "6px",
        DEFAULT: "8px",
        card: "12px",
        panel: "16px",
        modal: "20px",
        feature: "24px",
      },
      transitionDuration: {
        fast: "120ms",
        standard: "180ms",
        slow: "260ms",
      },
    },
  },
};
