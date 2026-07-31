export type FeatureKind =
  | 'table'
  | 'form'
  | 'dashboard'
  | 'calc'
  | 'bot'
  | 'trade'
  | 'link';

export type ExchangeFeature = {
  slug: string;
  titleEn: string;
  titleRu: string;
  kind: FeatureKind;
  href?: string;
};

export type ExchangeCategory = {
  id: string;
  titleEn: string;
  titleRu: string;
  features: ExchangeFeature[];
};
