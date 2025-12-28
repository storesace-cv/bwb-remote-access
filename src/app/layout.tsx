import "./globals.css";

export const metadata = {
  title: "BWB | Android Support",
  description: "RustDesk + MeshCentral integration frontend"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}