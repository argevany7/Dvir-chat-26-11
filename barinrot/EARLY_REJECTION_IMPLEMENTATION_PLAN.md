# Early Rejection Handling Implementation Plan - ToDo

- [ ] Analyze existing `server.js` and prompt logic to identify message handling flow and where to add rejection detection
- [ ] Enhance prompt and/or server-side logic to detect early rejection keywords or semantic equivalents (e.g., "לא מעוניין", "לא רלוונטי", objections)
- [ ] Implement first response behavior: upon rejection detection, send "Why?" question to user
- [ ] Implement waiting mechanism to delay next steps by 5 hours for user reply
- [ ] If no reply after 5 hours, send notification message to managers including:
  - User phone number (mandatory)
  - Extracted user name (if available)
  - Extracted rejection reason (if available)
- [ ] Implement scheduling system to send automated follow-up messages at random times every 2 weeks after initial rejection and no response
- [ ] Implement indefinite loop of follow-ups every 2 weeks until user explicitly requests to stop receiving messages
- [ ] Add detection to stop follow-ups when user replies with any opt-out request (e.g., "תפסיק לשלוח", "לא מעוניין" after follow-up)
- [ ] Test entire flow end-to-end:
  - Early rejection detection
  - "Why?" question sending
  - Waiting 5 hours logic
  - Manager notification delivery
  - Two-week random time follow-ups repeated indefinitely
  - Opt-out behavior stops all future messages
- [ ] Deploy changes and monitor initial behavior for correctness and user experience

This plan will guide the implementation for the requested enhancement.
