import TemplateEditor from "@/components/admin/TemplateEditor";
import Header from "@/components/layout/Header";
import { useConfig } from "@/hooks/useConfig";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminPage() {
  const { loading, error } = useConfig();
  useDocumentTitle("Template Manager — WF Cropper");

  return (
    <>
      <Header />
      <main id="main-content" className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold">Template manager</h1>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading configuration…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <TemplateEditor />
        )}
      </main>
    </>
  );
}
