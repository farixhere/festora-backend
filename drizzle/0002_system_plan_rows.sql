-- Festora system plan rows required by trial and coupon subscriptions.
INSERT INTO plans (code,name,duration_months,amount_minor,currency,is_active,display_order,features)
VALUES
  ('free','Free trial',1,0,'INR',true,0,'{"maxStudents":40}'),
  ('coupon','Coupon entitlement',1,0,'INR',true,0,'{"unlimitedStudents":true}')
ON CONFLICT (code) DO NOTHING;
