import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Trophy, ArrowRight, AlertTriangle, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { ModeToggle } from '../components/ModeToggle';

export default function PersonalResults() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const campaign = useStore(state => state.campaigns.find(c => c.id === campaignId));
  const participantId = sessionStorage.getItem('currentParticipantId');
  
  // In a real app, we would compute Elo based on the participant's specific votes.
  // For the mock, we'll just display a slightly randomized version of the global ratings
  // to simulate personal preferences.
  const allRatings = useStore(state => state.ratings);
  const globalRatings = useMemo(() => allRatings.filter(r => r.campaignId === campaignId), [allRatings, campaignId]);
  
  const allModelConfigs = useStore(state => state.modelConfigs);
  const modelConfigs = useMemo(() => allModelConfigs.filter(m => m.campaignId === campaignId), [allModelConfigs, campaignId]);
  
  const personalRatings = useMemo(() => [...globalRatings].map(r => ({
    ...r,
    elo: r.elo + Math.floor(Math.random() * 100) - 50 // Mock personal variance
  })).sort((a, b) => b.elo - a.elo), [globalRatings]);

  const allVotes = useStore(state => state.votes);
  const participantVotes = useMemo(() => allVotes.filter(v => v.participantId === participantId && v.promptId.startsWith('p')), [allVotes, participantId]); // Mock check
  const voteCount = participantVotes.length || 15; // Fallback to 15 for demo if no votes found

  if (!campaign) {
    return <div className="min-h-screen flex items-center justify-center">Campaign not found</div>;
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        
        <div className="flex justify-end">
          <ModeToggle />
        </div>

        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Your Results</h1>
          <p className="text-lg text-muted-foreground">
            Based on your {voteCount} comparisons in <span className="font-medium text-foreground">{campaign.name}</span>
          </p>
        </div>

        {voteCount < 20 && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 text-amber-500">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Your sample is small — treat this as directional.</span> 
              <p className="text-sm mt-1 opacity-90">With fewer than 20 votes, your personal Elo rankings have wide confidence intervals. The models at the top are generally preferred by you, but the exact order might shift with more data.</p>
            </div>
          </div>
        )}

        <Card className="shadow-md border-border overflow-hidden">
          <CardHeader className="bg-card text-card-foreground border-b border-border">
            <CardTitle className="text-xl">Your Personal Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-16 text-center">Rank</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Your Elo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personalRatings.map((rating, idx) => {
                  const model = modelConfigs.find(m => m.modelId === rating.modelId);
                  return (
                    <TableRow key={rating.modelId} className={idx === 0 ? "bg-primary/5" : ""}>
                      <TableCell className="text-center font-medium">
                        {idx === 0 ? <span className="text-primary text-lg">1</span> : <span className="text-muted-foreground">{idx + 1}</span>}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {model?.modelName || rating.modelId}
                        {idx === 0 && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-normal">Top Pick</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-muted-foreground">{rating.elo}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-2">Category Insights</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                You strongly preferred <span className="font-medium text-foreground">{modelConfigs.find(m => m.modelId === personalRatings[0]?.modelId)?.modelName}</span> for <strong>Translation</strong> tasks, but leaned towards <span className="font-medium text-foreground">{modelConfigs.find(m => m.modelId === personalRatings[1]?.modelId)?.modelName}</span> for <strong>Creative Writing</strong>.
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-2">Group Alignment</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                You aligned with the overall consensus <span className="font-medium text-emerald-500 text-lg">68%</span> of the time. You were more critical of GPT-5 than the average voter.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-border">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => {
            navigator.clipboard.writeText("My top model for " + campaign.name + " is " + (modelConfigs.find(m => m.modelId === personalRatings[0]?.modelId)?.modelName) + "!");
            alert("Copied to clipboard!");
          }}>
            <Share2 className="w-4 h-4 mr-2" />
            Share Results
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => navigate(`/campaign/${campaign.id}`)}>
            See Full Leaderboard
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
        
      </div>
    </div>
  );
}
