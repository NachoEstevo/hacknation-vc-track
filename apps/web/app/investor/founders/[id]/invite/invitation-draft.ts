type InvitationDraftInput = {
  founderName: string;
  projectName: string | null;
};

export const INVITATION_STATUS_COPY = {
  draft: "Draft only · nothing has been prepared, copied, or sent.",
  prepared: "Invitation prepared locally · no message has been sent.",
  copied: "Invitation draft copied · no message has been sent.",
  copy_error: "Clipboard access failed. Select and copy the message manually.",
} as const;

export function createInvitationDraft({
  founderName,
  projectName,
}: InvitationDraftInput): string {
  const greeting = founderName === "Unresolved founder"
    ? "there"
    : founderName.split(" ")[0];
  const subject = projectName ?? "a project profile";

  return (
    `Hi ${greeting},\n\n`
    + `I’m reviewing ${subject} through undr. `
    + "I’d value your help checking the sourced details currently captured. "
    + "Please reply with any corrections, missing context, or outdated information. "
    + "This is a diligence request, not an investment decision.\n\nThanks."
  );
}

export function invitationDraftForClipboard(message: string): string {
  return message.trim();
}
