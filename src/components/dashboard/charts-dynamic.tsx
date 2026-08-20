import dynamic from "next/dynamic";

/**
 * `recharts` is a meaningfully sized client dependency (SVG chart engine +
 * its own internal deps) that was previously imported statically from
 * src/components/dashboard/charts.tsx into every Server Component that
 * renders a chart (dashboard + 6 report pages - see the callers of this
 * file). That put recharts's JS in the initial client bundle for every one
 * of those routes even though the charts render after the page's data has
 * streamed in (see the critical/secondary split in dashboard-data.ts) and
 * are never the LCP element.
 *
 * `next/dynamic` here code-splits recharts into its own chunk, fetched
 * only for routes that actually render a chart, without changing any
 * component's props/behavior. SSR stays on (no `ssr: false`, which is not
 * supported when the caller is a Server Component - see
 * node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md) so the
 * chart still has real markup in the initial HTML instead of causing a
 * layout shift while its chunk loads.
 */
export const BarChartCard = dynamic(() => import("./charts").then((m) => m.BarChartCard));
export const PieChartCard = dynamic(() => import("./charts").then((m) => m.PieChartCard));
export const TrendChartCard = dynamic(() => import("./charts").then((m) => m.TrendChartCard));
