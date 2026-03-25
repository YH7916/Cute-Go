/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    // 👇 修改了这里：扫描根目录下的 tsx/js 文件
    "./*.{js,ts,jsx,tsx}",
    // 👇 扫描 components 文件夹
    "./components/**/*.{js,ts,jsx,tsx}",
    // 👇 如果你有 utils 文件夹里也写了样式，加上这行
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}