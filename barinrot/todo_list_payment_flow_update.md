# Payment Flow Update Todo List

- [x] Create payment flow update todo list  
- [x] Update ariel_system_prompt.json with new payment enforcement rules  
- [ ] Implement backend bot logic related to payment status and messaging  
  - Block conversation finishing before payment confirmation  
  - Show “waiting for payment” message if payment link sent but not yet paid  
  - On payment confirmation, clear the waiting flag in DB and allow normal closing messages  
  - Continue to ask for full name after sending payment link  
- [ ] Create and run end-to-end tests for payment flow behavior  
  - Verify no finish message before payment  
  - Verify “waiting for payment” message presence pre-payment  
  - Verify DB flag cleared on payment confirmation  
  - Verify full name request after payment link sent
