'use client';

/**
 * DenialDefender — Google Agent Platform Status Card
 *
 * Shows whether the 3 adopted Agent Platform components (Memory, Policies, Registry)
 * are connected to the real Google service or running in local-fallback mode.
 *
 * This is the visual proof that our GEAP claims are GENUINE — not checkbox integration.
 * When deployed on GCP, all 3 components show "Platform" status.
 * When running locally, they show "Local Fallback" status.
 *
 * Per Anti-Pattern #3: "Google employees spot checkbox integration instantly."
 * This card makes it visible whether our integration is real or custom.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Cloud,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Database,
  ShieldCheck,
  Users,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface PlatformComponentStatus {
  available: boolean;
  lastBackend: 'platform' | 'local';
  lastError: string | null;
  lastSuccessAt: string | null;
  role?: string;
  gateResult?: string;
}

interface PlatformData {
  success: boolean;
  strategy: string;
  platformAvailable: boolean;
  projectId: string;
  region: string;
  components: {
    registry: PlatformComponentStatus & { role: string; gateResult: string };
    memory: PlatformComponentStatus & { role: string; gateResult: string };
    policies: PlatformComponentStatus & { role: string; gateResult: string };
  };
  skipped: { name: string; reason: string }[];
}

const COMPONENT_ICONS = {
  registry: Users,
  memory: Database,
  policies: ShieldCheck,
};

const COMPONENT_LABELS = {
  registry: 'Agent Registry',
  memory: 'Memory Bank',
  policies: 'Model Armor',
};

export default function PlatformStatusCard() {
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/platform');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Platform status fetch failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <Card className="border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Google Agent Platform
            </CardTitle>
            <CardDescription className="mt-1">
              Platform-Accelerated, Demo-First: 3 adopted components with local fallback
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
            className="h-8"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Platform availability banner */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
          {data?.platformAvailable ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">
                Connected to GCP project <code className="px-1 py-0.5 bg-muted rounded text-xs">{data.projectId}</code> in <code className="px-1 py-0.5 bg-muted rounded text-xs">{data.region}</code>
              </span>
            </>
          ) : (
            <>
              <Server className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Local mode — set GCP_PROJECT_ID to enable platform integration
              </span>
            </>
          )}
        </div>

        {/* The 3 adopted components */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['registry', 'memory', 'policies'] as const).map((key) => {
            const comp = data?.components[key];
            const Icon = COMPONENT_ICONS[key];
            const label = COMPONENT_LABELS[key];
            const isPlatform = comp?.lastBackend === 'platform';
            const isAvailable = comp?.available;

            return (
              <div
                key={key}
                className={`p-3 rounded-lg border ${
                  isPlatform
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${isPlatform ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className="text-sm font-semibold">{label}</span>
                </div>

                <div className="flex items-center gap-1.5 mb-1.5">
                  <Badge
                    variant={isPlatform ? 'default' : 'secondary'}
                    className={`text-xs ${
                      isPlatform
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                    }`}
                  >
                    {isPlatform ? (
                      <><Cloud className="h-3 w-3 mr-1" /> Platform</>
                    ) : (
                      <><Server className="h-3 w-3 mr-1" /> Local Fallback</>
                    )}
                  </Badge>
                  {isAvailable === false && comp?.lastError && (
                    <Badge variant="destructive" className="text-xs">
                      Error
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {comp?.role || 'Component role'}
                </p>

                {comp?.lastSuccessAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last success: {new Date(comp.lastSuccessAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Gate results — why these 3 were adopted */}
        {data?.components && (
          <details className="group">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer flex items-center gap-1">
              <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              Blueprint Gate Results (Table 12.1)
            </summary>
            <div className="mt-2 space-y-2 pl-4">
              {(['registry', 'memory', 'policies'] as const).map((key) => {
                const comp = data.components[key];
                return (
                  <div key={key} className="text-xs text-muted-foreground">
                    <span className="font-medium">{COMPONENT_LABELS[key]}:</span>{' '}
                    {comp.gateResult}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* Skipped components — why they were CUT */}
        {data?.skipped && data.skipped.length > 0 && (
          <details className="group">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer flex items-center gap-1">
              <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              Skipped Components ({data.skipped.length})
            </summary>
            <div className="mt-2 space-y-1.5 pl-4">
              {data.skipped.map((item) => (
                <div key={item.name} className="text-xs text-muted-foreground flex items-center gap-2">
                  <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                  <span>
                    <span className="font-medium line-through">{item.name}</span> — {item.reason}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Strategy summary */}
        <div className="text-xs text-muted-foreground border-t pt-3 mt-3">
          <strong>Strategy:</strong> {data?.strategy || 'Platform-Accelerated, Demo-First'} —
          Adopt Agent Platform for exactly 3 components (Memory, Policies, Registry)
          that pass the blueprint gate. Skip all others. Every platform call falls back
          to existing local implementation — zero execution risk.
        </div>
      </CardContent>
    </Card>
  );
}
