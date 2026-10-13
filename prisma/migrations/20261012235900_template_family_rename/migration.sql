-- Template families were split: "appointment" became "clinic" (dental, medical, veterinary); salons and spas now use "beauty".
UPDATE "GeneratedSite" SET "templateId" = 'clinic' WHERE "templateId" = 'appointment';
