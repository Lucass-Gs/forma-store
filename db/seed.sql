INSERT INTO products(id,name,description,price_cents,stock,category,art) VALUES
('40000000-0000-4000-8000-000000000001','Forma','Vaso de cerâmica. Design simples, presença marcante.',8900,30,'Casa','◒'),
('40000000-0000-4000-8000-000000000002','Luz','Luminária de mesa para criar seu próximo projeto.',14900,20,'Casa','◠'),
('40000000-0000-4000-8000-000000000003','Ideia','Caderno para decisões, rascunhos e planos.',4900,50,'Papelaria','▤'),
('40000000-0000-4000-8000-000000000004','Pausa','Caneca para um intervalo bem aproveitado.',5900,15,'Casa','◡'),
('40000000-0000-4000-8000-000000000005','Traço','Kit de lápis para transformar uma ideia.',2900,40,'Papelaria','╱'),
('40000000-0000-4000-8000-000000000006','Tempo','Relógio com desenho essencial.',19900,8,'Casa','◷') ON CONFLICT DO NOTHING;
