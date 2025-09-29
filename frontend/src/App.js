import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import FundingArbitrageDashboard from "./components/FundingArbitrageDashboard";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<FundingArbitrageDashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
