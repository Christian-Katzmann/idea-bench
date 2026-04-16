import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Activity, Clock, Layers } from 'lucide-react';
import { ModeToggle } from '../components/ModeToggle';

export default function ParticipantLanding() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const campaign = useStore(state => state.campaigns.find(c => c.id === campaignId));
  const addParticipant = useStore(state => state.addParticipant);
  
  const [email, setEmail] = useState('');

  if (!campaign) {
    return <div className="min-h-screen flex items-center justify-center">Campaign not found</div>;
  }

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    const participantId = `p-${Date.now()}`;
    addParticipant({
      id: participantId,
      email,
      campaignId: campaign.id,
      startedAt: new Date().toISOString()
    });
    
    // Store participant ID in session storage for the voting flow
    sessionStorage.setItem('currentParticipantId', participantId);
    navigate(`/vote/${campaign.id}/play`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-foreground relative">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
        <div className="p-8 text-center border-b border-border bg-sidebar text-foreground">
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">{campaign.name}</h1>
          <p className="text-muted-foreground text-sm">Model Evaluation Campaign</p>
        </div>
        
        <div className="p-8">
          <p className="text-muted-foreground mb-6 text-center leading-relaxed">
            {campaign.description}
          </p>
          
          <div className="flex items-center justify-center gap-6 mb-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>~3 mins</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>15 comparisons</span>
            </div>
          </div>

          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <Input 
                type="text" 
                placeholder="Enter your name or email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-12 text-center text-lg bg-background border-border"
                autoFocus
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={!email.trim()}
            >
              Start Voting
            </Button>
          </form>
          
          <p className="text-xs text-muted-foreground text-center mt-6">
            No password required. Your email is only used to track completion.
          </p>
        </div>
      </div>
    </div>
  );
}
