-- StoreSync Phase 1 Database Schema
-- Content management for public website

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Content publication status enum
CREATE TYPE publication_status AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'SCHEDULED', 'UNPUBLISHED', 'EXPIRED');

-- Language enum
CREATE TYPE language AS ENUM ('en', 'ne');

-- Content pages (home, about, privacy, terms, etc.)
CREATE TABLE content_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  title_ne VARCHAR(255),
  content_en TEXT NOT NULL,
  content_ne TEXT,
  meta_description_en TEXT,
  meta_description_ne TEXT,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  CHECK (
    (status = 'PUBLISHED' AND published_at IS NOT NULL) OR
    (status != 'PUBLISHED')
  ),
  CHECK (
    (status = 'SCHEDULED' AND scheduled_for IS NOT NULL) OR
    (status != 'SCHEDULED')
  )
);

-- Store locations
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en VARCHAR(255) NOT NULL,
  name_ne VARCHAR(255),
  address_en TEXT NOT NULL,
  address_ne TEXT,
  landmark_en VARCHAR(255),
  landmark_ne VARCHAR(255),
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  map_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  hours_en JSONB,
  hours_ne JSONB,
  services_en JSONB,
  services_ne JSONB,
  is_temporarily_closed BOOLEAN DEFAULT FALSE,
  closure_reason_en TEXT,
  closure_reason_ne TEXT,
  closure_start TIMESTAMP WITH TIME ZONE,
  closure_end TIMESTAMP WITH TIME ZONE,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en VARCHAR(255) NOT NULL,
  name_ne VARCHAR(255),
  description_en TEXT,
  description_ne TEXT,
  slug VARCHAR(255) UNIQUE NOT NULL,
  image_url TEXT,
  parent_id UUID REFERENCES categories(id),
  sort_order INTEGER DEFAULT 0,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products (published catalog only)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(100) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ne VARCHAR(255),
  description_en TEXT,
  description_ne TEXT,
  category_id UUID REFERENCES categories(id),
  pack_size_en VARCHAR(100),
  pack_size_ne VARCHAR(100),
  unit_en VARCHAR(50),
  unit_ne VARCHAR(50),
  image_url TEXT,
  images JSONB,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_featured BOOLEAN DEFAULT FALSE,
  meta_title_en VARCHAR(255),
  meta_title_ne VARCHAR(255),
  meta_description_en TEXT,
  meta_description_ne TEXT,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- Store product availability (language only, no exact quantities)
CREATE TABLE store_product_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  availability_status VARCHAR(50) NOT NULL, -- 'AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(store_id, product_id)
);

-- Offers and campaigns
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_en VARCHAR(255) NOT NULL,
  title_ne VARCHAR(255),
  description_en TEXT NOT NULL,
  description_ne TEXT,
  image_url TEXT,
  banner_image_url TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  terms_en TEXT,
  terms_ne TEXT,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  is_featured BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Offer product associations
CREATE TABLE offer_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0
);

-- FAQ items
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_en VARCHAR(500) NOT NULL,
  question_ne VARCHAR(500),
  answer_en TEXT NOT NULL,
  answer_ne TEXT,
  category VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Services
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en VARCHAR(255) NOT NULL,
  name_ne VARCHAR(255),
  description_en TEXT,
  description_ne TEXT,
  icon VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  status publication_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact form submissions
CREATE TABLE contact_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'NEW', -- 'NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45)
);

-- Audit log for content changes
CREATE TABLE content_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'UNPUBLISH'
  old_values JSONB,
  new_values JSONB,
  performed_by VARCHAR(255) NOT NULL,
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT
);

-- Create indexes for performance
CREATE INDEX idx_content_pages_status ON content_pages(status);
CREATE INDEX idx_content_pages_slug ON content_pages(slug);
CREATE INDEX idx_stores_status ON stores(status);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_categories_status ON categories(status);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offers_dates ON offers(start_date, end_date);
CREATE INDEX idx_faqs_status ON faqs(status);
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_store_product_availability ON store_product_availability(store_id, product_id);
CREATE INDEX idx_content_audit_log_entity ON content_audit_log(entity_type, entity_id);
CREATE INDEX idx_contact_submissions_status ON contact_submissions(status);
