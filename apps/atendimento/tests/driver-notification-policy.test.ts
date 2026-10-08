import { expect, it } from "vitest";
import { driverNotificationEligible } from "../lib/domain";

it("permite notificação proativa somente para comprovante e penalidade", () => {
  expect(driverNotificationEligible("aguardando_comprovante")).toBe(true);
  expect(driverNotificationEligible("penalidade")).toBe(true);
  expect(driverNotificationEligible("aberta")).toBe(false);
  expect(driverNotificationEligible("encerrada")).toBe(false);
  expect(driverNotificationEligible("revisao")).toBe(false);
});
