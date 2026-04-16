import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore, Generation } from '../store';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModeToggle } from '../components/ModeToggle';

export default function VotingInterface() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const campaign = useStore(state => state.campaigns.find(c => c.id === campaignId));
  const allPrompts = useStore(state => state.prompts);
  const prompts = useMemo(() => allPrompts.filter(p => p.campaignId === campaignId), [allPrompts, campaignId]);
  const allGenerations = useStore(state => state.generations);
  const addVote = useStore(state => state.addVote);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const totalPairs = 15; // Mock target
  
  // Mock generating pairs for voting
  const [pairs, setPairs] = useState<{prompt: any, genA: Generation, genB: Generation}[]>([]);
  
  useEffect(() => {
    if (prompts.length > 0 && allGenerations.length > 0 && pairs.length === 0) {
      // Create mock pairs
      const newPairs = [];
      for (let i = 0; i < totalPairs; i++) {
        const prompt = prompts[i % prompts.length];
        const promptGens = allGenerations.filter(g => g.promptId === prompt.id);
        if (promptGens.length >= 2) {
          // Pick 2 random
          const shuffled = [...promptGens].sort(() => 0.5 - Math.random());
          newPairs.push({
            prompt,
            genA: shuffled[0],
            genB: shuffled[1]
          });
        }
      }
      setPairs(newPairs);
    }
  }, [prompts, allGenerations, pairs.length]);

  const handleVote = useCallback((winner: 'A' | 'B' | 'tie' | 'both_bad') => {
    if (pairs.length === 0) return;
    
    const currentPair = pairs[currentIndex];
    const participantId = sessionStorage.getItem('currentParticipantId') || 'anonymous';
    
    addVote({
      id: `v-${Date.now()}`,
      participantId,
      promptId: currentPair.prompt.id,
      generationA_id: currentPair.genA.id,
      generationB_id: currentPair.genB.id,
      winner,
      timestamp: new Date().toISOString()
    });
    
    if (currentIndex < pairs.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      navigate(`/vote/${campaignId}/results`);
    }
  }, [currentIndex, pairs, addVote, navigate, campaignId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') handleVote('A');
      if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowRight') handleVote('B');
      if (e.key === 't' || e.key === 'T' || e.key === 'ArrowUp') handleVote('tie');
      if (e.key === 'x' || e.key === 'X' || e.key === 'ArrowDown') handleVote('both_bad');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleVote]);

  if (!campaign || pairs.length === 0) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const currentPair = pairs[currentIndex];
  const progress = ((currentIndex) / pairs.length) * 100;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground hover:bg-foreground/5">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="font-medium text-foreground hidden sm:block">{campaign.name}</div>
        </div>
        
        <div className="flex items-center gap-4 flex-1 max-w-md mx-4">
          <Progress value={progress} className="h-2 bg-border" />
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {currentIndex + 1} of {pairs.length}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button variant="ghost" size="icon" onClick={() => navigate(`/vote/${campaignId}/results`)} className="text-muted-foreground hover:text-foreground hover:bg-foreground/5" title="Quit early">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Prompt Area */}
        <div className="bg-card border-b border-border p-4 shrink-0 shadow-sm z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              Prompt
              {currentPair.prompt.categoryTags.map((tag: string) => (
                <span key={tag} className="bg-foreground/5 text-muted-foreground border border-border px-2 py-0.5 rounded-full text-[10px]">{tag}</span>
              ))}
            </div>
            <p className="text-foreground font-medium text-lg leading-relaxed">
              {currentPair.prompt.text}
            </p>
            {currentPair.prompt.context && (
              <div className="mt-3 p-3 bg-background rounded text-sm text-muted-foreground border border-border">
                <span className="font-semibold text-foreground mr-2">Context:</span>
                {currentPair.prompt.context}
              </div>
            )}
          </div>
        </div>

        {/* Voting Area */}
        <div className="flex-1 overflow-hidden relative bg-background p-4">
          <div className="max-w-5xl mx-auto h-full flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.15 }}
                className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0"
              >
                {/* Model A */}
                <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden">
                  <div className="bg-sidebar border-b border-border px-4 py-2 flex justify-between items-center shrink-0">
                    <span className="font-semibold text-foreground">Model A</span>
                    <span className="text-xs text-muted-foreground font-mono">{currentPair.genA.tokens} tokens</span>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 text-foreground whitespace-pre-wrap leading-relaxed">
                    {currentPair.genA.output}
                  </div>
                  <div className="p-4 border-t border-border bg-sidebar shrink-0">
                    <Button 
                      className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground" 
                      onClick={() => handleVote('A')}
                    >
                      A is better <span className="ml-2 text-primary-foreground/70 text-sm font-normal border border-primary-foreground/20 px-1.5 rounded">A</span>
                    </Button>
                  </div>
                </div>

                {/* Model B */}
                <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden">
                  <div className="bg-sidebar border-b border-border px-4 py-2 flex justify-between items-center shrink-0">
                    <span className="font-semibold text-foreground">Model B</span>
                    <span className="text-xs text-muted-foreground font-mono">{currentPair.genB.tokens} tokens</span>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 text-foreground whitespace-pre-wrap leading-relaxed">
                    {currentPair.genB.output}
                  </div>
                  <div className="p-4 border-t border-border bg-sidebar shrink-0">
                    <Button 
                      className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground" 
                      onClick={() => handleVote('B')}
                    >
                      B is better <span className="ml-2 text-primary-foreground/70 text-sm font-normal border border-primary-foreground/20 px-1.5 rounded">B</span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Tie / Both Bad Controls */}
            <div className="mt-4 flex justify-center gap-4 shrink-0">
              <Button variant="outline" className="bg-card border-border text-foreground hover:bg-foreground/5 w-32" onClick={() => handleVote('tie')}>
                Tie <span className="ml-2 text-muted-foreground text-xs border border-border px-1 rounded">T</span>
              </Button>
              <Button variant="outline" className="bg-card border-border text-foreground hover:bg-foreground/5 w-32" onClick={() => handleVote('both_bad')}>
                Both Bad <span className="ml-2 text-muted-foreground text-xs border border-border px-1 rounded">X</span>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
