import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface AttentionItem {
  id: string;
  name: string;
  meta?: string;
  onSelect?: () => void;
}

interface AttentionSection {
  title: string;
  emptyLabel: string;
  items: AttentionItem[];
}

export default function AttentionPanel({ sections }: { sections: AttentionSection[] }) {
  return (
    <Card className="border-border bg-card rounded-xl shadow-none">
      <CardHeader className="border-b border-border/80 pb-4">
        <CardTitle className="text-lg">Needs Attention</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>
            {section.items.length > 0 ? (
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-sm text-foreground">{item.name}</div>
                      {item.meta && (
                        <div className="text-xs text-muted-foreground mt-0.5">{item.meta}</div>
                      )}
                    </div>
                    {item.onSelect && (
                      <Button variant="ghost" size="sm" onClick={item.onSelect}>
                        Open
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                {section.emptyLabel}
              </div>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
