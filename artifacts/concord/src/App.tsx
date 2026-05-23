import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import ParticleBackground from "@/components/ParticleBackground";
import ToastManager from "@/components/ToastManager";
import LandingPage from "@/pages/LandingPage";
import RoleSelectPage from "@/pages/RoleSelectPage";
import NegotiatePage from "@/pages/NegotiatePage";
import CreateRoom from "@/pages/CreateRoom";
import JoinRoom from "@/pages/JoinRoom";
import RoomPage from "@/pages/RoomPage";
import ResultPage from "@/pages/ResultPage";
import ContractPage from "@/pages/ContractPage";
import InboxPage from "@/pages/InboxPage";
import DepositPage from "@/pages/DepositPage";
import ProfilePage from "@/pages/ProfilePage";
import CreateAuction from "@/pages/CreateAuction";
import AuctionRoom from "@/pages/AuctionRoom";
import AuctionResult from "@/pages/AuctionResult";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/role" component={RoleSelectPage} />
      <Route path="/negotiate" component={NegotiatePage} />
      <Route path="/create" component={CreateRoom} />
      <Route path="/join" component={JoinRoom} />
      <Route path="/room/:id" component={RoomPage} />
      <Route path="/result/:id" component={ResultPage} />
      <Route path="/contract" component={ContractPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/deposit/:id" component={DepositPage} />
      <Route path="/profile" component={ProfilePage} />
      {/* Wave 5: Multi-Party Auction Routes */}
      <Route path="/auction/create" component={CreateAuction} />
      <Route path="/auction/:id" component={AuctionRoom} />
      <Route path="/auction/result/:id" component={AuctionResult} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ParticleBackground />
          <Router />
          <ToastManager />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

