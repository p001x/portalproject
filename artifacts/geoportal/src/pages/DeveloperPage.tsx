import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Key, Copy, Eye, EyeOff, RefreshCcw, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DeveloperPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: apiKeyData, isLoading } = useQuery({
    queryKey: ["apiKey"],
    queryFn: () => api.developer.getApiKey(),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.developer.generateApiKey(),
    onSuccess: (data) => {
      queryClient.setQueryData(["apiKey"], data);
      setShowKey(true);
      toast({
        title: "API Key Generated",
        description: "Your new API key is ready to use.",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Error Generating Key",
        description: err.message || "An unknown error occurred.",
      });
    },
  });

  const copyToClipboard = () => {
    if (apiKeyData?.api_key) {
      navigator.clipboard.writeText(apiKeyData.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        description: "API Key copied to clipboard",
      });
    }
  };

  const currentKey = apiKeyData?.api_key;
  const displayKey = currentKey
    ? showKey
      ? currentKey
      : currentKey.substring(0, 8) + "•".repeat(24)
    : "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto py-10 px-6">
        <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Terminal className="w-8 h-8 text-primary" />
          API Gateway
        </h1>
        <p className="text-muted-foreground mt-2">
          Use the Geospatial Backend-as-a-Service to query analysis engines directly from your own scripts, QGIS, or custom applications.
        </p>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm mb-10">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-emerald-500" />
          Your API Key
        </h2>
        
        {isLoading ? (
          <div className="animate-pulse h-10 bg-muted rounded-md w-full max-w-md"></div>
        ) : currentKey ? (
          <div className="space-y-4">
            <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 stroke-emerald-600 dark:stroke-emerald-400" />
              <AlertTitle>Active</AlertTitle>
              <AlertDescription>
                Your API key is active. Keep it secure and do not share it in public repositories.
              </AlertDescription>
            </Alert>
            
            <div className="flex items-center gap-2 w-full">
              <Input
                type="text"
                readOnly
                value={displayKey}
                className="font-mono bg-muted/50 text-foreground flex-1 overflow-x-auto"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "Hide API Key" : "Reveal API Key"}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                title="Copy to clipboard"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            
            <div className="pt-4 border-t mt-6">
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Are you sure you want to regenerate your API Key? Any scripts using the old key will break immediately.")) {
                    generateMutation.mutate();
                  }
                }}
                disabled={generateMutation.isPending}
              >
                <RefreshCcw className={`w-4 h-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                Regenerate API Key
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You do not currently have an API Key. Generate one to start accessing the SPETRO API.
            </p>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <Key className={`w-4 h-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              Generate API Key
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Quick Start</h2>
        <p className="text-muted-foreground text-sm">
          Authenticate requests by passing your API Key in the <code className="bg-muted px-1 py-0.5 rounded text-primary">X-API-Key</code> header, or as a Bearer token in the <code className="bg-muted px-1 py-0.5 rounded text-primary">Authorization</code> header.
        </p>

        <div className="bg-slate-950 text-slate-50 rounded-lg p-5 overflow-x-auto shadow-inner border border-slate-800">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">Python Example (Requests)</div>
          <pre className="text-sm font-mono text-emerald-400 leading-relaxed">
<span className="text-blue-400">import</span> requests<br/><br/>
API_KEY = <span className="text-yellow-300">"{currentKey || 'sk_live_YOUR_API_KEY'}"</span><br/>
ENDPOINT = <span className="text-yellow-300">"https://geoportal-api-ygzi.onrender.com/api/ndvi"</span><br/><br/>
headers = &#123;<br/>
    <span className="text-yellow-300">"X-API-Key"</span>: API_KEY,<br/>
    <span className="text-yellow-300">"Content-Type"</span>: <span className="text-yellow-300">"application/json"</span><br/>
&#125;<br/><br/>
payload = &#123;<br/>
    <span className="text-yellow-300">"aoi"</span>: &#123;<span className="text-yellow-300">"type"</span>: <span className="text-yellow-300">"gaul2"</span>, <span className="text-yellow-300">"name"</span>: <span className="text-yellow-300">"Gasabo"</span>&#125;,<br/>
    <span className="text-yellow-300">"start_date"</span>: <span className="text-yellow-300">"2024-01-01"</span>,<br/>
    <span className="text-yellow-300">"end_date"</span>: <span className="text-yellow-300">"2024-06-30"</span>,<br/>
    <span className="text-yellow-300">"n_classes"</span>: 5<br/>
&#125;<br/><br/>
response = requests.post(ENDPOINT, json=payload, headers=headers)<br/>
<span className="text-blue-400">print</span>(response.json())
          </pre>
        </div>

        <div className="bg-slate-950 text-slate-50 rounded-lg p-5 overflow-x-auto shadow-inner border border-slate-800">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">cURL Example</div>
          <pre className="text-sm font-mono text-emerald-400 leading-relaxed">
curl -X POST https://geoportal-api-ygzi.onrender.com/api/ndvi \<br/>
  -H <span className="text-yellow-300">"X-API-Key: {currentKey || 'sk_live_YOUR_API_KEY'}"</span> \<br/>
  -H <span className="text-yellow-300">"Content-Type: application/json"</span> \<br/>
  -d <span className="text-yellow-300">'&#123;"aoi": &#123;"type": "gaul2", "name": "Gasabo"&#125;, "start_date": "2024-01-01", "end_date": "2024-06-30", "n_classes": 5&#125;'</span>
          </pre>
        </div>
      </div>
    </div>
    </div>
  );
}
