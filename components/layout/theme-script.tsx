export function ThemeScript() {
  const code = `
(() => {
  try {
    const stored = localStorage.getItem("alc-theme");
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
