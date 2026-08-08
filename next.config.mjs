/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfkit loads its font AFM files from node_modules at runtime; keep it
  // external to the server bundle so those paths stay intact.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
