import QRCode from "qrcode";
import { hex } from "../../core/ids.js";

/** EMV field: id + 2-digit length + value. */
const field = (id: string, value: string): string => `${id}${value.length.toString().padStart(2, "0")}${value}`;

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), as the BR Code spec requires. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * A structurally valid dynamic Pix BR Code ("copia e cola"), so apps that parse or
 * render it behave as with a real one. It points at a sandbox location and can never be paid.
 */
export function buildPixPayload(value: number): string {
  const merchantAccount = field("00", "br.gov.bcb.pix") + field("25", `pix.sandbox.invalid/qr/v2/${hex(16)}`);
  const body =
    field("00", "01") +
    field("01", "12") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986") +
    field("54", value.toFixed(2)) +
    field("58", "BR") +
    field("59", "ASAAS SANDBOX") +
    field("60", "SAO PAULO") +
    field("62", field("05", "***")) +
    "6304";
  return body + crc16(body);
}

/** Base64 PNG of the QR code, without the data-URL prefix (as Asaas returns it). */
export async function buildPixImage(payload: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 400 });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}
