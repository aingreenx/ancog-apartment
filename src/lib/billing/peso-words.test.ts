import { describe, expect, it } from "vitest";
import { numberToWords, pesoToWords } from "./peso-words";

describe("numberToWords", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [13, "Thirteen"],
    [20, "Twenty"],
    [45, "Forty-Five"],
    [100, "One Hundred"],
    [101, "One Hundred One"],
    [945, "Nine Hundred Forty-Five"],
    [1000, "One Thousand"],
    [3972, "Three Thousand Nine Hundred Seventy-Two"],
    [10_838, "Ten Thousand Eight Hundred Thirty-Eight"],
    [100_000, "One Hundred Thousand"],
    [1_000_001, "One Million One"],
    [2_500_350, "Two Million Five Hundred Thousand Three Hundred Fifty"],
  ])("%i → %s", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it("rejects what it can't spell", () => {
    expect(() => numberToWords(-1)).toThrow();
    expect(() => numberToWords(1.5)).toThrow();
  });
});

describe("pesoToWords", () => {
  it("whole pesos", () => {
    expect(pesoToWords(397_200)).toBe("Three Thousand Nine Hundred Seventy-Two Pesos Only");
    expect(pesoToWords(250_000)).toBe("Two Thousand Five Hundred Pesos Only");
  });

  it("singular peso", () => {
    expect(pesoToWords(100)).toBe("One Peso Only");
  });

  it("centavos as a fraction", () => {
    expect(pesoToWords(1_375)).toBe("Thirteen Pesos and 75/100 Only");
    expect(pesoToWords(5)).toBe("Zero Pesos and 05/100 Only");
  });
});
