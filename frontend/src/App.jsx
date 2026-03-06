import React, { useState } from 'react';

function App() {
  const [query, setQuery] = useState('');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Calling your Express backend route
      const response = await fetch(`http://localhost:5000/api/emails/search?q=${query}`);
      const data = await response.json();
      setEmails(data);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-pink-300 bg-polka-dots text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-1 text-[#FFF58A] text-center font-arcade ">Email Scrapper</h1>
        <p className="text-xl font-medium font-arcade mb-8 text-center text-cyber-pink ">Scrape &nbsp; Emails &nbsp; like &nbsp; a &nbsp; pro!</p>
        <button 
  onClick={() => window.location.href = 'http://localhost:5000/auth/google'}
  className="absolute right-8 top-8 mb-4 bg-neon-mint text-gray-200 px-4 py-2 rounded-md font-arcade flex text-xl items-center gap-2 border-2 border-white hover:bg-deep-teal transition"
>
  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
  Connect
</button>
        <hr className="h-[5px] w-full bg-deep-teal my-6"></hr>
        
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-4 mb-10">
          <input 
            type="text" 
            placeholder="Enter &nbsp; Keyword"
            className="flex-1 p-2 rounded-sm bg-gray-200 border-2 border-deep-teal focus:outline-none focus:border-neon-mint text-cyber-pink/70 font-bold font-arcade text-2xl"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button 
            type="submit" 
            className="bg-[#FFF58A] hover:bg-yellow-300 px-6 py-3 rounded font-semibold transition text-deep-teal font-arcade"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Results Table */}
        <div className="bg-pink-200 rounded-md overflow-hidden border border-deep-teal/70">
          <table className="w-full text-left">
            <thead className="bg-cyber-pink text-deep-teal font-arcade text-xl uppercase text-sm">
              <tr>
                <th className="p-4">Sender</th>
                <th className="p-4">Subject</th>
                <th className="p-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {emails.length > 0 ? emails.map((email) => (
                <tr key={email.id} className="border-t border-deep-teal/70 hover:bg-gray-750 transition">
                  <td className="p-4 text-sm font-medium text-pink-500">{email.from}</td>
                  <td className="p-4 text-sm">
                    <div className="font-semibold text-deep-teal ">{email.subject}</div>
                    <div className="text-gray-400 text-xs truncate w-64">{email.snippet}</div>
                  </td>
                  <td className="p-4 text-xs text-pink-500 ">{new Date(email.date).toLocaleDateString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3" className="p-10 text-center text-gray-500">
                    No emails found. Try searching for a keyword above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;