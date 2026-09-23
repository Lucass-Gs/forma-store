import "../src/style.css";
export const metadata = {
  title: "Forma Store · Objetos essenciais",
  description:
    "E-commerce demonstrativo com checkout transacional e pagamento simulado.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
