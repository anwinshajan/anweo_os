import { invoiceNumber, formatMoneyPdf, termsSentence, fileNameFor, termsList, sealRing } from "../../src/lib/invoice.ts";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };

ok("invoice number is padded", invoiceNumber(7) === "ANW-0007" && invoiceNumber(12345) === "ANW-12345");
ok("no number means draft", invoiceNumber(null) === "DRAFT" && invoiceNumber(undefined) === "DRAFT");
ok("pdf pounds use the symbol", formatMoneyPdf(1250.5, "GBP") === "£1,250.50");
ok("pdf rupees use the ISO code", formatMoneyPdf(42000, "INR").replace(/\s/g, " ") === "INR 42,000.00");
ok("pdf accepts numeric strings", formatMoneyPdf("99", "USD") === "$99.00");
ok("terms with interest", termsSentence(14, 2, 3).includes("14 days") && termsSentence(14, 2, 3).includes("2% of the unpaid amount") && termsSentence(14, 2, 3).includes("3-day"));
ok("terms without interest omit late wording", !termsSentence(7, 0, 0).includes("Late") && termsSentence(1, 0, 0).includes("1 day "));
ok("file name", fileNameFor({ number: "ANW-0042" }) === "Anweo-Invoice-ANW-0042.pdf");
ok("terms are split one clause per line, blanks dropped", termsList("A\n\n B \n").join("|") === "A|B" && termsList(null).length === 0);
ok("seal text is centred on the ring and reads left to right", (() => { const t = sealRing("ABC", "top"); const b = sealRing("ABC", "bottom"); return t[0].rot < 0 && t[2].rot > 0 && Math.abs(t[0].rot + t[2].rot) < 1e-9 && b[0].rot > 0 && b[2].rot < 0; })());
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
