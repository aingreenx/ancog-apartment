import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { pesoToWords } from "@/lib/billing/peso-words";
import { formatDate } from "@/lib/money";
import type { ReceiptData } from "./receipt-data";

// The built-in PDF fonts have no ₱ glyph, so amounts are written "PHP 3,972.00".
const php = (centavos: number) =>
  `PHP ${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHOD: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank: "Bank transfer",
  deposit: "Deposit",
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#18181b" },
  header: { borderBottom: "1.5pt solid #18181b", paddingBottom: 8, marginBottom: 12 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  subtitle: { fontSize: 12, marginTop: 2 },
  address: { fontSize: 9, color: "#52525b", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", marginBottom: 5 },
  label: { width: 120, color: "#52525b" },
  value: { flex: 1 },
  amountBox: { border: "1pt solid #18181b", padding: 8, marginVertical: 10 },
  amount: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 12, borderTop: "0.5pt solid #a1a1aa", paddingTop: 8 },
  sectionTitle: { fontFamily: "Helvetica-Bold", marginBottom: 6 },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  cell: { flex: 1 },
  cellRight: { flex: 1, textAlign: "right" },
  signature: { marginTop: 28, alignSelf: "flex-end", width: 200, alignItems: "center" },
  signatureImage: { height: 40, objectFit: "contain", marginBottom: 2 },
  signatureLine: {
    borderTop: "0.75pt solid #18181b",
    width: "100%",
    paddingTop: 3,
    textAlign: "center",
  },
  void: {
    position: "absolute",
    top: 300,
    left: 80,
    fontSize: 110,
    fontFamily: "Helvetica-Bold",
    color: "#dc2626",
    opacity: 0.25,
    transform: "rotate(-30deg)",
  },
  voidNote: { color: "#dc2626", fontFamily: "Helvetica-Bold", marginBottom: 8 },
});

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{children}</Text>
    </View>
  );
}

export function ReceiptDocument({ r }: { r: ReceiptData }) {
  const f = r.figures;
  const forWhat =
    f.items.length === 0
      ? "Advance payment (kept as credit)"
      : f.items.map((i) => `${i.description}${i.full ? "" : " (partial)"}`).join("; ") +
        (f.credit > 0 ? `; ${php(f.credit)} kept as credit` : "");

  return (
    <Document title={`Acknowledgement Receipt No. ${r.receiptNo}`} author="Ancog Apartment">
      <Page size="A5" style={s.page}>
        {r.voided && <Text style={s.void}>VOID</Text>}

        <View style={s.header}>
          <Text style={s.title}>ANCOG APARTMENT</Text>
          <Text style={s.subtitle}>Acknowledgement Receipt</Text>
          <Text style={s.address}>{r.address}</Text>
        </View>

        <View style={s.metaRow}>
          <Text>
            No. <Text style={s.bold}>{String(r.receiptNo).padStart(6, "0")}</Text>
          </Text>
          <Text>Date: {formatDate(r.paidOn)}</Text>
        </View>

        {r.voided && (
          <Text style={s.voidNote}>
            VOID - {formatDate(r.voided.at.slice(0, 10))}
            {r.voided.reason ? `: ${r.voided.reason}` : ""}
          </Text>
        )}

        <Row label="Received from">
          {r.receivedFrom}
          {r.room !== null ? `, Room ${r.room}` : ""}
        </Row>

        <View style={s.amountBox}>
          <Text style={s.amount}>{php(r.amount)}</Text>
          <Text>{pesoToWords(r.amount)}</Text>
        </View>

        <Row label="Payment">{f.kind}</Row>
        <Row label="For">{forWhat}</Row>
        <Row label="Method">
          {METHOD[r.method] ?? r.method}
          {r.referenceNo ? `  ·  Ref. no. ${r.referenceNo}` : ""}
        </Row>
        <Row label="Balance remaining">{php(f.balanceRemaining)}</Row>

        {f.electricity.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Electricity</Text>
            {f.electricity.map((e, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text>{e.description}</Text>
                <View style={s.tableRow}>
                  <Text style={s.cell}>Previous: {e.prevKwh.toLocaleString("en-PH")} kWh</Text>
                  <Text style={s.cell}>Current: {e.currKwh.toLocaleString("en-PH")} kWh</Text>
                </View>
                <Text>
                  {e.currKwh.toLocaleString("en-PH")} - {e.prevKwh.toLocaleString("en-PH")} ={" "}
                  {e.kwhUsed.toLocaleString("en-PH")} kWh × {php(e.rate)}/kWh = {php(e.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.signature}>
          {r.signature && (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
            <Image
              style={s.signatureImage}
              src={{ data: Buffer.from(r.signature), format: "png" }}
            />
          )}
          <Text style={s.signatureLine}>Received by: {r.receivedBy}</Text>
        </View>
      </Page>
    </Document>
  );
}

export function renderReceiptPdf(r: ReceiptData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument r={r} />);
}
