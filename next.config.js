/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // The PDF library is loaded as a normal Node package instead of being bundled.
  serverExternalPackages: ["@react-pdf/renderer"],
};
