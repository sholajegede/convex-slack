// Shared "New invoice" modal view — opened by http.ts's interactivity
// handler when the "Open invoice" shortcut fires. Kept in one place so the
// shortcut wiring and the view definition can't drift apart.
export const invoiceModalView = {
  type: "modal",
  callback_id: "invoice_modal",
  title: { type: "plain_text", text: "New invoice" },
  submit: { type: "plain_text", text: "Send" },
  blocks: [
    {
      type: "input",
      block_id: "amount",
      label: { type: "plain_text", text: "Amount" },
      element: { type: "plain_text_input", action_id: "value" },
    },
  ],
} as const;
