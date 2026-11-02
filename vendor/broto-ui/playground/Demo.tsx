import { Card, CodeBlock } from 'broto-ui';
import type { ReactNode } from 'react';

/** Bloco do catálogo: título, exemplo vivo e código recolhível. */
export function Demo({
  title,
  description,
  code,
  children,
  flush,
}: {
  title: ReactNode;
  description?: ReactNode;
  code?: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <Card title={title} subtitle={description} flush={flush} bare={flush}>
      {flush ? children : null}
      {!flush && (
        <>
          {children}
          {code && (
            <details className="pg-code">
              <summary>Ver código</summary>
              <CodeBlock>{code.trim()}</CodeBlock>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
