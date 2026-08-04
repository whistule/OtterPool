import Head from 'expo-router/head';

/**
 * Sets the browser tab title for a screen.
 *
 * Without this the document title is empty and browsers fall back to showing
 * the URL. The `title` in Tabs.Screen/Stack.Screen options only names the tab
 * and native header — it never reaches `document.title`.
 *
 * expo-router's Head renders only while its screen is focused, so nested
 * screens don't fight over the title, and because the web build is
 * `output: "static"` the title is baked into the prerendered HTML rather than
 * appearing once JS boots.
 */
export function PageTitle({ title }: { title: string }) {
  return (
    <Head>
      <title>{`${title} · OtterPool`}</title>
    </Head>
  );
}
