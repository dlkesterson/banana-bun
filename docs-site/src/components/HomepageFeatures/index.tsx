import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Privacy-First AI',
    description: (
      <>
        All AI processing happens locally on your machine. No data leaves your device,
        ensuring complete privacy while leveraging powerful AI models for media organization.
      </>
    ),
  },
  {
    title: 'Intelligent Organization',
    description: (
      <>
        Automatically tag, categorize, and organize your media files using advanced AI.
        Banana Bun learns from your usage patterns to improve organization over time.
      </>
    ),
  },
  {
    title: 'Powerful Search',
    description: (
      <>
        Find anything instantly with semantic search across all your content.
        Search by meaning, not just keywords, using vector embeddings and full-text search.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center" />
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
