import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, Campaign, Prompt, ModelConfig } from '../store';
import OperatorLayout from '../components/layout/OperatorLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Check, ChevronRight, Loader2, Play, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SUGGESTED_TAGS = ['translation', 'summarization', 'code', 'creative writing', 'data extraction', 'reasoning', 'structured output'];
const AVAILABLE_MODELS = [
  { id: 'claude-3-opus', name: 'Claude Opus 4.6' },
  { id: 'claude-3-sonnet', name: 'Claude Sonnet 4.6' },
  { id: 'gpt-5', name: 'GPT-5' },
  { id: 'gpt-5-mini', name: 'GPT-5-mini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'llama-4', name: 'Llama 4' },
  { id: 'deepseek-v3', name: 'DeepSeek V3' },
];

export default function CreateCampaign() {
  const navigate = useNavigate();
  const addCampaign = useStore(state => state.addCampaign);
  const [step, setStep] = useState(1);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  
  const [prompts, setPrompts] = useState([{ text: '', context: '' }]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const handleNext = () => setStep(s => Math.min(5, s + 1));
  const handleBack = () => setStep(s => Math.max(1, s - 1));

  const toggleCategory = (cat: string) => {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const toggleModel = (id: string) => {
    setSelectedModels(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    
    // Simulate generation
    const interval = setInterval(() => {
      setGenerationProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setIsGenerating(false);
          return 100;
        }
        return p + 5;
      });
    }, 200);
  };

  const handleLaunch = () => {
    const newCampaign: Campaign = {
      id: `c-${Date.now()}`,
      name,
      description,
      categories,
      status: 'active',
      createdAt: new Date().toISOString(),
      operatorId: 'op1',
      shareLink: `https://modelarena.app/c/c-${Date.now()}`
    };
    addCampaign(newCampaign);
    navigate(`/campaign/${newCampaign.id}`);
  };

  return (
    <OperatorLayout>
      <div className="max-w-3xl mx-auto w-full">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-px bg-border -z-10" />
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2 bg-background px-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                step === s ? "bg-primary text-primary-foreground" : 
                step > s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"
              )}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              <span className={cn(
                "text-xs font-medium uppercase tracking-wider",
                step >= s ? "text-foreground" : "text-muted-foreground"
              )}>
                {s === 1 ? 'Basics' : s === 2 ? 'Prompts' : s === 3 ? 'Models' : s === 4 ? 'Preview' : 'Launch'}
              </span>
            </div>
          ))}
        </div>

        <Card className="shadow-none border-border bg-card rounded-xl">
          <CardContent className="p-8">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">Campaign Basics</h2>
                  <p className="text-muted-foreground text-sm">Define what you are evaluating.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-muted-foreground text-xs uppercase tracking-wider">Campaign Name</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Customer Support Response Quality" className="bg-background border-border" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="desc" className="text-muted-foreground text-xs uppercase tracking-wider">Description (shown to voters)</Label>
                    <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Briefly explain what voters should look for..." className="h-24 bg-background border-border" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">Categories</Label>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_TAGS.map(tag => (
                        <Badge 
                          key={tag} 
                          variant={categories.includes(tag) ? "default" : "outline"}
                          className={cn("cursor-pointer", categories.includes(tag) ? "bg-primary text-primary-foreground" : "bg-background border-border text-muted-foreground hover:bg-foreground/5")}
                          onClick={() => toggleCategory(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">Prompts & Context</h2>
                  <p className="text-muted-foreground text-sm">Add the prompts you want to evaluate.</p>
                </div>

                <div className="space-y-6">
                  {prompts.map((prompt, idx) => (
                    <div key={idx} className="p-5 border border-border bg-background rounded-xl space-y-4 relative group">
                      {prompts.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => setPrompts(p => p.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Prompt {idx + 1}</Label>
                        <Textarea 
                          value={prompt.text} 
                          onChange={e => {
                            const newP = [...prompts];
                            newP[idx].text = e.target.value;
                            setPrompts(newP);
                          }}
                          placeholder="Enter the prompt text..." 
                          className="bg-card border-border"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Context (Optional)</Label>
                        <Textarea 
                          value={prompt.context} 
                          onChange={e => {
                            const newP = [...prompts];
                            newP[idx].context = e.target.value;
                            setPrompts(newP);
                          }}
                          placeholder="Background information or system instructions..." 
                          className="h-20 text-sm bg-card border-border"
                        />
                      </div>
                    </div>
                  ))}
                  
                  <Button variant="outline" onClick={() => setPrompts([...prompts, { text: '', context: '' }])} className="w-full border-dashed border-border bg-background hover:bg-foreground/5 text-foreground">
                    <Plus className="w-4 h-4 mr-2" /> Add another prompt
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">Select Models</h2>
                  <p className="text-muted-foreground text-sm">Choose which models to pit against each other.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_MODELS.map(model => (
                    <div 
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      className={cn(
                        "p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                        selectedModels.includes(model.id) 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-border bg-background hover:border-border/80 text-foreground"
                      )}
                    >
                      <span className="font-medium">{model.name}</span>
                      {selectedModels.includes(model.id) && <Check className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-[28px] font-semibold tracking-tight mb-1">Generate & Preview</h2>
                  <p className="text-muted-foreground text-sm">Run the prompts through the selected models to generate outputs for voting.</p>
                </div>

                <div className="bg-background p-6 rounded-xl border border-border text-center space-y-4">
                  <div className="flex justify-center gap-8 text-sm">
                    <div><span className="font-mono font-semibold text-foreground">{prompts.length}</span> <span className="text-muted-foreground">Prompts</span></div>
                    <div><span className="font-mono font-semibold text-foreground">{selectedModels.length}</span> <span className="text-muted-foreground">Models</span></div>
                    <div><span className="font-mono font-semibold text-foreground">{prompts.length * selectedModels.length}</span> <span className="text-muted-foreground">Total Generations</span></div>
                  </div>
                  
                  {!isGenerating && generationProgress === 0 && (
                    <Button onClick={handleGenerate} size="lg" className="w-full max-w-sm bg-foreground text-background hover:bg-foreground/90">
                      <Play className="w-4 h-4 mr-2" /> Start Generation
                    </Button>
                  )}

                  {isGenerating && (
                    <div className="space-y-2 max-w-sm mx-auto">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                        </span>
                        <span className="font-mono font-medium">{generationProgress}%</span>
                      </div>
                      <div className="h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-200" style={{ width: `${generationProgress}%` }} />
                      </div>
                    </div>
                  )}

                  {generationProgress === 100 && !isGenerating && (
                    <div className="text-emerald-500 flex items-center justify-center gap-2 font-medium">
                      <CheckCircle2 className="w-5 h-5" /> Generation Complete
                    </div>
                  )}
                </div>
                
                {generationProgress === 100 && (
                  <div className="text-sm text-muted-foreground text-center">
                    Outputs are ready. In a real app, you would preview them here.
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-8">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <Check className="w-8 h-8" />
                </div>
                <h2 className="text-[28px] font-semibold tracking-tight">Ready to Launch</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Your campaign "{name}" is ready. Once launched, you'll get a shareable link to send to participants.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="text-muted-foreground hover:text-foreground hover:bg-foreground/5">
                Back
              </Button>
              {step < 5 ? (
                <Button onClick={handleNext} disabled={
                  (step === 1 && !name) || 
                  (step === 2 && !prompts[0].text) || 
                  (step === 3 && selectedModels.length < 2) ||
                  (step === 4 && generationProgress < 100)
                } className="bg-foreground text-background hover:bg-foreground/90">
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleLaunch} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Launch Campaign
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </OperatorLayout>
  );
}
