import { BinaryWriter } from "../../utils/BinaryWriter";
import { GAIA_BYTE_ORDER_LE, GAIA_MBR, GAIA_START } from "./GaiaConstants";
import { GaiaFormatError } from "./GaiaErrors";

/** GAIA 头部包络前缀长度：start(1) + byteOrder(1) + srid(4) + MBR(32) + marker(1) + geoType(4)。 */
export const GAIA_ENVELOPE_HEADER_LENGTH = 43;

export interface GaiaEnvelope {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 轻量读取 GAIA 包络（不解码完整几何），语义与 Go `codec.ReadGaiaEnvelope` 对齐。 */
export function readGaiaEnvelope(input: Uint8Array): GaiaEnvelope {
  if (input.length < GAIA_ENVELOPE_HEADER_LENGTH) {
    throw new GaiaFormatError(
      `GAIA envelope header is truncated: got ${input.length} bytes`
    );
  }
  const start = input[0]!;
  const byteOrder = input[1]!;
  const mbrMarker = input[38]!;
  if (start !== GAIA_START) {
    throw new GaiaFormatError(
      `Invalid GAIA start marker: expected 0x${GAIA_START.toString(16)}, got 0x${start.toString(16)}.`
    );
  }
  if (byteOrder !== GAIA_BYTE_ORDER_LE) {
    throw new GaiaFormatError(
      `Unsupported byte order: expected 0x${GAIA_BYTE_ORDER_LE.toString(16)}, got 0x${byteOrder.toString(16)}.`
    );
  }
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const minX = view.getFloat64(6, true);
  const minY = view.getFloat64(14, true);
  const maxX = view.getFloat64(22, true);
  const maxY = view.getFloat64(30, true);
  if (mbrMarker !== GAIA_MBR) {
    throw new GaiaFormatError(
      `Invalid GAIA MBR marker: expected 0x${GAIA_MBR.toString(16)}, got 0x${mbrMarker.toString(16)}.`
    );
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    throw new GaiaFormatError("GAIA envelope contains non-finite coordinates");
  }
  return { minX, minY, maxX, maxY };
}

/** 编码 GAIA 包络头（用于 Text/CAD `SmIndexKey` 与测试夹具）。 */
export function encodeGaiaEnvelopeHeader(
  envelope: GaiaEnvelope,
  srid: number,
  geoType: number
): Uint8Array {
  const writer = new BinaryWriter(GAIA_ENVELOPE_HEADER_LENGTH);
  writer.writeUint8(GAIA_START);
  writer.writeUint8(GAIA_BYTE_ORDER_LE);
  writer.writeInt32(srid, true);
  writer.writeFloat64(envelope.minX, true);
  writer.writeFloat64(envelope.minY, true);
  writer.writeFloat64(envelope.maxX, true);
  writer.writeFloat64(envelope.maxY, true);
  writer.writeUint8(GAIA_MBR);
  writer.writeInt32(geoType, true);
  return writer.toUint8Array();
}
