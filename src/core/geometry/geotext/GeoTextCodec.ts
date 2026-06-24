import type { Color, TextGeometry, TextStyle, TextSubText } from "../../types";
import { BinaryCursor } from "../../utils/BinaryCursor";
import { BinaryWriter } from "../../utils/BinaryWriter";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class GeoTextCodec {
  static decode(input: Uint8Array | ArrayBuffer): TextGeometry {
    const cursor = new BinaryCursor(input);
    const geoType = cursor.readInt32();
    if (geoType !== 7) {
      throw new Error(`Unsupported GeoText geoType: ${geoType}`);
    }

    const styleSize = cursor.readInt32();
    if (styleSize !== 0) {
      throw new Error(`Text dataset GeoHeader.styleSize must be 0: ${styleSize}`);
    }

    const subCount = cursor.readInt32();
    if (subCount < 1) {
      throw new Error(`GeoText subCount must be positive: ${subCount}`);
    }

    const style = this.readTextStyle(cursor);
    const subTexts: TextSubText[] = [];
    for (let index = 0; index < subCount; index++) {
      subTexts.push(this.readSubText(cursor));
    }

    if (cursor.remaining !== 0) {
      throw new Error(`GeoText has trailing bytes: ${cursor.remaining}`);
    }

    const first = subTexts[0]!;
    const geometry: TextGeometry = {
      type: "Text",
      text: subTexts.map((subText) => subText.text).join(""),
      anchor: first.anchor,
      style,
      subTexts,
      geoType
    };
    if (first.rotation !== undefined) {
      return { ...geometry, rotation: first.rotation };
    }
    return geometry;
  }

  static encode(geometry: TextGeometry): Uint8Array {
    const normalized = this.normalizeGeometry(geometry);
    const writer = new BinaryWriter();

    writer.writeInt32(7);
    writer.writeInt32(0);
    writer.writeInt32(normalized.subTexts.length);
    this.writeTextStyle(writer, normalized.style);

    for (const subText of normalized.subTexts) {
      this.writeSubText(writer, subText);
    }

    return writer.toUint8Array();
  }

  private static readTextStyle(cursor: BinaryCursor): TextStyle {
    const color = this.readColor(cursor);
    const fixedSize = cursor.readUint8();
    const weight = cursor.readUint8();
    const styleFlag = cursor.readUint8();
    const alignFlag = cursor.readUint8();
    const backgroundColor = this.readColor(cursor);
    const fontWidth = cursor.readFloat64();
    const fontHeight = cursor.readFloat64();
    const anchor = [cursor.readFloat64(), cursor.readFloat64()] as const;
    const faceName = this.readString(cursor);

    return {
      color,
      backgroundColor,
      fixedSize,
      weight,
      styleFlag,
      alignFlag,
      fontWidth,
      fontHeight,
      anchor,
      faceName
    };
  }

  private static readSubText(cursor: BinaryCursor): TextSubText {
    const anchor = [cursor.readFloat64(), cursor.readFloat64()] as const;
    const subAngle = cursor.readInt32();
    const reserved = cursor.readInt32();
    if (reserved !== 0) {
      throw new Error(`GeoSubText.reserved must be 0: ${reserved}`);
    }

    const subText: TextSubText = {
      text: this.readString(cursor),
      anchor
    };
    return { ...subText, rotation: subAngle / 10 };
  }

  private static readColor(cursor: BinaryCursor): Color {
    return {
      a: cursor.readUint8(),
      b: cursor.readUint8(),
      g: cursor.readUint8(),
      r: cursor.readUint8()
    };
  }

  private static readString(cursor: BinaryCursor): string {
    const length = cursor.readInt32();
    if (length < 0 || length > cursor.remaining) {
      throw new Error(`Invalid GeoText string byte length: ${length}`);
    }
    return decoder.decode(cursor.readBytes(length));
  }

  private static normalizeGeometry(geometry: TextGeometry): {
    readonly style: Required<TextStyle>;
    readonly subTexts: readonly Required<TextSubText>[];
  } {
    const anchor = geometry.anchor;
    const style = this.normalizeStyle(geometry.style, anchor);
    const subTexts = (geometry.subTexts?.length ? geometry.subTexts : [
      {
        text: geometry.text,
        anchor,
        rotation: geometry.rotation ?? 0
      }
    ]).map((subText) => ({
      text: subText.text,
      anchor: subText.anchor,
      rotation: subText.rotation ?? 0
    }));

    return { style, subTexts };
  }

  private static normalizeStyle(
    style: TextStyle | undefined,
    anchor: readonly [number, number]
  ): Required<TextStyle> {
    return {
      color: style?.color ?? { a: 0, b: 0, g: 0, r: 255 },
      backgroundColor: style?.backgroundColor ?? {
        a: 255,
        b: 255,
        g: 255,
        r: 255
      },
      fixedSize: style?.fixedSize ?? 10,
      weight: style?.weight ?? 64,
      styleFlag: style?.styleFlag ?? 6,
      alignFlag: style?.alignFlag ?? 0,
      fontWidth: style?.fontWidth ?? 0,
      fontHeight: style?.fontHeight ?? 0.406494140625,
      anchor: style?.anchor ?? anchor,
      faceName: style?.faceName ?? "宋体"
    };
  }

  private static writeTextStyle(writer: BinaryWriter, style: Required<TextStyle>): void {
    this.writeColor(writer, style.color);
    writer.writeUint8(style.fixedSize);
    writer.writeUint8(style.weight);
    writer.writeUint8(style.styleFlag);
    writer.writeUint8(style.alignFlag);
    this.writeColor(writer, style.backgroundColor);
    writer.writeFloat64(style.fontWidth);
    writer.writeFloat64(style.fontHeight);
    writer.writeFloat64(style.anchor[0]);
    writer.writeFloat64(style.anchor[1]);
    this.writeString(writer, style.faceName);
  }

  private static writeSubText(
    writer: BinaryWriter,
    subText: Required<TextSubText>
  ): void {
    writer.writeFloat64(subText.anchor[0]);
    writer.writeFloat64(subText.anchor[1]);
    writer.writeInt32(Math.round(subText.rotation * 10));
    writer.writeInt32(0);
    this.writeString(writer, subText.text);
  }

  private static writeColor(writer: BinaryWriter, color: Color): void {
    writer.writeUint8(color.a);
    writer.writeUint8(color.b);
    writer.writeUint8(color.g);
    writer.writeUint8(color.r);
  }

  private static writeString(writer: BinaryWriter, value: string): void {
    const bytes = encoder.encode(value);
    writer.writeInt32(bytes.byteLength);
    writer.writeBytes(bytes);
  }
}
