import { Font } from "@react-pdf/renderer";
import { PDF_FONTS } from "@/lib/pdf-fonts";

// Registers the brand fonts once, however many PDF templates are loaded.
export function setupPdfFonts() {
  const have = Font.getRegisteredFontFamilies();
  if (!have.includes("InterTight")) Font.register({ family: "InterTight", fonts: [{ src: PDF_FONTS.interTight400, fontWeight: 400 }, { src: PDF_FONTS.interTight600, fontWeight: 600 }, { src: PDF_FONTS.interTight700, fontWeight: 700 }] });
  if (!have.includes("Mono")) Font.register({ family: "Mono", fonts: [{ src: PDF_FONTS.mono400, fontWeight: 400 }, { src: PDF_FONTS.mono500, fontWeight: 500 }] });
  Font.registerHyphenationCallback((w) => [w]);
}
