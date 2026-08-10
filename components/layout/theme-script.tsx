export function ThemeScript() {
  const code = `
(() => {
  try {
    const stored = localStorage.getItem("alc-theme");
    const theme = stored === "light" || stored === "dark" ? stored : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
