import WizardFlow from "@/components/wizard/WizardFlow";
import Header from "@/components/layout/Header";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function WizardPage() {
  useDocumentTitle("Setup Wizard — WF Cropper");

  return (
    <>
      <Header />
      <main id="main-content" className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold">Setup wizard</h1>
        <WizardFlow />
      </main>
    </>
  );
}
