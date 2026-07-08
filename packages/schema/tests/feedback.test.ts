import { describe, expect, it } from "vitest";
import { FeedbackRecordSchema } from "../src/feedback.js";

const baseFeedback = {
  id: "feedback-1",
  placementId: "placement-1",
  sourceId: "source-1",
  submittedAt: "2026-07-08T10:00:00.000Z",
  submittedByRole: "medical-student",
  feedbackType: "wrong-availability",
  institutionName: "Example Hospital",
  departmentNormalized: "internal-medicine",
  currentValue: "Available",
  suggestedValue: "Fully booked until 2027-12",
  evidenceType: "official-source",
  evidenceUrl: "https://example.ch/placements",
  evidenceNote: "Official page says the department is fully booked.",
  confidenceSuggested: "medium",
  status: "new",
  reviewerNote: null,
};

describe("FeedbackRecordSchema", () => {
  it("accepts structured static feedback without personal identity fields", () => {
    const parsed = FeedbackRecordSchema.parse(baseFeedback);

    expect(parsed.feedbackType).toBe("wrong-availability");
    expect(parsed.submittedByRole).toBe("medical-student");
  });

  it("rejects accidental personal identity fields", () => {
    const result = FeedbackRecordSchema.safeParse({
      ...baseFeedback,
      submitterEmail: "student@example.ch",
      submitterName: "Student Name",
    });

    expect(result.success).toBe(false);
  });

  it("requires reviewer notes for accepted feedback", () => {
    const result = FeedbackRecordSchema.safeParse({
      ...baseFeedback,
      status: "accepted",
      reviewerNote: "",
    });

    expect(result.success).toBe(false);
  });

  it("allows missing hospital reports without a placement or source id", () => {
    const parsed = FeedbackRecordSchema.parse({
      ...baseFeedback,
      placementId: null,
      sourceId: null,
      feedbackType: "missing-hospital-source",
      currentValue: null,
      suggestedValue: "Add Example Regional Hospital.",
      status: "triaged",
    });

    expect(parsed.feedbackType).toBe("missing-hospital-source");
  });

  it("requires a referenced record or source for ordinary feedback", () => {
    const result = FeedbackRecordSchema.safeParse({
      ...baseFeedback,
      placementId: null,
      sourceId: null,
    });

    expect(result.success).toBe(false);
  });
});
