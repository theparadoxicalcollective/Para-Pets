import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import gameFrameCss from "./script/gameFrameCss.cjs";

export default {
  plugins: [tailwindcss(), autoprefixer(), gameFrameCss()],
};
