-- Reference data seed. Safe to run against any environment (no PII, no auth users).
insert into public.categories (name, slug, sort_order) values
  ('Coffee & Beverages', 'coffee-beverages', 1),
  ('Food & Dining', 'food-dining', 2),
  ('Clothing & Abaya', 'clothing-abaya', 3),
  ('Perfume & Oud', 'perfume-oud', 4),
  ('Accessories & Jewelry', 'accessories-jewelry', 5),
  ('Beauty & Skincare', 'beauty-skincare', 6),
  ('Home & Lifestyle', 'home-lifestyle', 7),
  ('Kids & Family', 'kids-family', 8),
  ('Art & Handmade', 'art-handmade', 9),
  ('Other', 'other', 99)
on conflict (slug) do nothing;

insert into public.notification_templates (key, channel, subject, body) values
  ('account_created', 'email', 'Welcome to Dar Al Hay Events', 'Hi {{owner_name}}, thanks for creating a business account for {{business_name}}. Please verify your email to continue.'),
  ('email_verified', 'email', 'Email verified', 'Hi {{owner_name}}, your email is verified. Complete your business profile to apply for events.'),
  ('profile_submitted', 'email', 'Profile submitted for review', 'Hi {{owner_name}}, your business profile has been submitted to Dar Al Hay Events for review.'),
  ('business_approved', 'email', 'You''re approved!', 'Hi {{owner_name}}, {{business_name}} has been approved. You can now apply for the open event.'),
  ('business_rejected', 'email', 'Update on your application', 'Hi {{owner_name}}, unfortunately {{business_name}} was not approved. Reason: {{reason}}'),
  ('booth_selection_opened', 'email', 'Booth selection is open', 'Hi {{owner_name}}, booth selection for {{event_name}} is now open.'),
  ('booth_locked', 'email', 'Booth held for you', 'Booth {{booth_number}} is held for {{business_name}} for {{minutes}} minutes.'),
  ('booth_lock_expiring', 'sms', null, 'Dar Al Hay: your hold on booth {{booth_number}} expires in {{minutes}} minutes. Complete your selection to keep it.'),
  ('booth_selected', 'email', 'Booth selected', 'Hi {{owner_name}}, you selected booth {{booth_number}} for {{event_name}}.'),
  ('payment_required', 'email', 'Complete your payment', 'Hi {{owner_name}}, please complete payment for booth {{booth_number}} within {{minutes}} minutes.'),
  ('payment_deadline_reminder', 'whatsapp', null, 'Reminder: your payment for booth {{booth_number}} is due soon.'),
  ('receipt_received', 'email', 'Receipt received', 'We received your transfer receipt and it is pending verification.'),
  ('payment_approved', 'email', 'Payment confirmed', 'Hi {{owner_name}}, your payment is confirmed. Booth {{booth_number}} is now yours for {{event_name}}.'),
  ('payment_rejected', 'email', 'Payment issue', 'Hi {{owner_name}}, we could not verify your receipt. Reason: {{reason}}'),
  ('booth_released', 'email', 'Booth released', 'Hi {{owner_name}}, booth {{booth_number}} has been released back to availability.'),
  ('waitlist_joined', 'email', 'You''re on the waiting list', 'Hi {{owner_name}}, you have joined the waiting list for {{event_name}}.'),
  ('booth_availability_invitation', 'email', 'A booth is available for you', 'Hi {{owner_name}}, booth {{booth_number}} is available. You have {{minutes}} minutes to accept.'),
  ('event_reminder', 'whatsapp', null, '{{event_name}} is coming up on {{start_date}}. See you there!'),
  ('setup_reminder', 'sms', null, 'Setup for {{event_name}} begins {{setup_start}}. Booth {{booth_number}}.'),
  ('important_announcement', 'email', '{{title}}', '{{body}}'),
  ('event_changes', 'email', 'Event update: {{event_name}}', '{{body}}')
on conflict (key, channel) do nothing;
