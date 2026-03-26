import { describe, expect, it } from "vitest";

import { BinaryCursor, BinaryWriter } from "../../src/index";

describe("BinaryWriter", () => {
  it("writes numeric values in little-endian order by default", () => {
    const writer = new BinaryWriter();

    writer.writeUint8(0x7c);
    writer.writeInt32(4326);
    writer.writeFloat64(116.123);

    const cursor = new BinaryCursor(writer.toUint8Array());

    expect(cursor.readUint8()).toBe(0x7c);
    expect(cursor.readInt32()).toBe(4326);
    expect(cursor.readFloat64()).toBeCloseTo(116.123);
    expect(cursor.remaining).toBe(0);
  });

  it("grows when capacity is exceeded", () => {
    const writer = new BinaryWriter(2);
    writer.writeBytes(new Uint8Array([1, 2, 3, 4, 5]));

    expect(Array.from(writer.toUint8Array())).toEqual([1, 2, 3, 4, 5]);
    expect(writer.length).toBe(5);
  });
});

describe("BinaryCursor", () => {
  it("supports seek, skip, peek and read operations", () => {
    const cursor = new BinaryCursor(new Uint8Array([0, 1, 2, 3, 4]));

    expect(cursor.peekUint8()).toBe(0);
    expect(cursor.readUint8()).toBe(0);

    cursor.skip(2);
    expect(cursor.position).toBe(3);
    expect(cursor.readUint8()).toBe(3);

    cursor.seek(1);
    expect(cursor.readBytes(2)).toEqual(new Uint8Array([1, 2]));
  });

  it("throws when reads exceed the remaining bytes", () => {
    const cursor = new BinaryCursor(new Uint8Array([1, 2]));

    expect(() => cursor.readBytes(3)).toThrow(RangeError);
    expect(() => cursor.seek(3)).toThrow(RangeError);
  });
});

