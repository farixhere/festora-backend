-- Starter plan. ₹499 is the only published price confirmed in the existing Festora frontend.
INSERT INTO plans (code,name,duration_months,amount_minor,currency,is_active,display_order,features)
VALUES ('m1','1 Month',1,49900,'INR',true,10,'{"unlimitedStudents":true,"unlimitedFestivals":true}')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,duration_months=EXCLUDED.duration_months,amount_minor=EXCLUDED.amount_minor,is_active=true,features=EXCLUDED.features,updated_at=now();
