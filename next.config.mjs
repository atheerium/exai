/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfkit and docx load their assets from node_modules at runtime; keep them
  // external to the server bundle so those paths stay intact.
  serverExternalPackages: ["pdfkit", "docx"],
};

export default nextConfig;
