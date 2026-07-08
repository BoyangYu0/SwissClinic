import { describe, expect, it } from "vitest";
import { parseAvailabilityStatus } from "../src/availability.js";

describe("availability parsing utilities", () => {
  it.each([
    [
      "ab Juli 2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
    ],
    [
      "ab 01.07.2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07-01",
        fullyBookedUntil: null,
      },
    ],
    [
      "dès juillet 2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
    ],
    [
      "à partir de juillet 2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
    ],
    [
      "à partir du 01.07.2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07-01",
        fullyBookedUntil: null,
      },
    ],
    [
      "da luglio 2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
    ],
    [
      "a partire da luglio 2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
    ],
    [
      "a partire dal 01.07.2027",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07-01",
        fullyBookedUntil: null,
      },
    ],
    [
      "ab Juli 2027, Bewerbungen 12 Monate im Voraus",
      {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        applicationLeadTimeMonths: 12,
      },
    ],
    [
      "keine freien Plätze bis Ende 2026",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2026-12",
      },
    ],
    [
      "ausgebucht bis Dezember 2027",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2027-12",
      },
    ],
    [
      "bis Ende 2026 ausgebucht",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2026-12",
      },
    ],
    [
      "complet jusqu'à fin 2026",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2026-12",
      },
    ],
    [
      "aucune place disponible jusqu'en décembre 2027",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2027-12",
      },
    ],
    [
      "occupato fino a fine 2026",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2026-12",
      },
    ],
    [
      "nessun posto disponibile fino a dicembre 2027",
      {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2027-12",
      },
    ],
    [
      "ab sofort",
      {
        availabilityStatus: "available",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "freie Plätze verfügbar",
      {
        availabilityStatus: "available",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "posti disponibili",
      {
        availabilityStatus: "available",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "nach Vereinbarung",
      {
        availabilityStatus: "not-specified",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "Bewerbungen 12 Monate im Voraus",
      {
        availabilityStatus: "application-only",
        availableFrom: null,
        applicationLeadTimeMonths: 12,
      },
    ],
    [
      "candidature 12 mois à l'avance",
      {
        availabilityStatus: "application-only",
        availableFrom: null,
        applicationLeadTimeMonths: 12,
      },
    ],
    [
      "candidatura con 12 mesi di anticipo",
      {
        availabilityStatus: "application-only",
        availableFrom: null,
        applicationLeadTimeMonths: 12,
      },
    ],
    [
      "Famulaturen können praktisch keine angeboten werden.",
      {
        availabilityStatus: "not-specified",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "Die Klinik für Neurologie bietet keine Famulaturen an.",
      {
        availabilityStatus: "not-specified",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "Voraussetzungen Deutschkenntnisse B2Keine Famulaturen möglich Freie Unterassistenzstellen",
      {
        availabilityStatus: "not-specified",
        availableFrom: null,
        fullyBookedUntil: null,
      },
    ],
    [
      "für mindestens 4 Wochen",
      {
        availabilityStatus: "not-specified",
        durationMinWeeks: 4,
        durationMaxWeeks: null,
      },
    ],
    [
      "1 bis 4 Monate",
      {
        availabilityStatus: "not-specified",
        durationMinWeeks: 4,
        durationMaxWeeks: 16,
      },
    ],
  ])("parses availability phrase %s", (phrase, expected) => {
    expect(parseAvailabilityStatus(phrase)).toMatchObject(expected);
  });

  it("does not treat fully booked wording as available from a date", () => {
    expect(parseAvailabilityStatus("bis Ende 2026 ausgebucht")).toMatchObject({
      availabilityStatus: "fully-booked-until",
      availableFrom: null,
      fullyBookedUntil: "2026-12",
    });
  });

  it("does not mark application deadlines as availability dates", () => {
    expect(parseAvailabilityStatus("Bewerbungsfrist bis Ende 2026")).toMatchObject({
      availabilityStatus: "application-only",
      availableFrom: null,
      fullyBookedUntil: null,
    });
  });

  it("returns not-specified for empty text", () => {
    expect(parseAvailabilityStatus(" ")).toMatchObject({
      availabilityStatus: "not-specified",
      warnings: ["No availability text was provided."],
    });
  });
});
