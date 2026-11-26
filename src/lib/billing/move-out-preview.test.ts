import { describe, expect, it } from "vitest";
import { previewMoveOut } from "./move-out-preview";

const peso = (n: number) => n * 100;

describe("previewMoveOut (same numbers as the move_out pgTAP test)", () => {
  it("445 owed + final 930 + cleaning 500, ₱55 credit, deposit 2,500 → refund 680", () => {
    expect(
      previewMoveOut({
        owed: peso(445),
        credit: peso(55),
        depositHeld: peso(2500),
        finalBill: peso(930),
        deductions: peso(500),
      }),
    ).toEqual({
      depositHeld: peso(2500),
      depositToDeductions: peso(500),
      depositToUnpaid: peso(1320),
      refund: peso(680),
      remainingOwed: 0,
      creditUsed: peso(55),
      creditLeft: 0,
    });
  });

  it("deposit too small: the rest stays owed", () => {
    expect(
      previewMoveOut({
        owed: peso(3500),
        credit: 0,
        depositHeld: peso(1000),
        finalBill: 0,
        deductions: 0,
      }),
    ).toMatchObject({ refund: 0, remainingOwed: peso(2500) });
  });

  it("credit larger than everything is returned too", () => {
    expect(
      previewMoveOut({
        owed: peso(100),
        credit: peso(300),
        depositHeld: peso(2500),
        finalBill: 0,
        deductions: peso(50),
      }),
    ).toMatchObject({
      creditUsed: peso(150),
      creditLeft: peso(150),
      refund: peso(2500),
      remainingOwed: 0,
    });
  });
});
