import { describe, expect, it } from "vitest";
import {
  createInvitationDraft,
  INVITATION_STATUS_COPY,
  invitationDraftForClipboard,
} from "./invitation-draft";

describe("founder invitation draft", () => {
  it("asks for a reply instead of promising a founder claim flow", () => {
    const draft = createInvitationDraft({
      founderName: "Mina Patel",
      projectName: "Quanta Forge",
    });

    expect(draft).toContain("Hi Mina");
    expect(draft).toContain("Please reply with any corrections");
    expect(draft).not.toContain("claim the profile");
    expect(draft).not.toContain("/investor/");
  });

  it("copies only the visible invitation text", () => {
    expect(invitationDraftForClipboard("  Manual invitation draft.\n"))
      .toBe("Manual invitation draft.");
    expect(INVITATION_STATUS_COPY.copied)
      .toBe("Invitation draft copied · no message has been sent.");
    expect(INVITATION_STATUS_COPY.copied).not.toContain("link");
  });
});
