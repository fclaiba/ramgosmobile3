import './global.css'
import AccountProvider from '../components/AccountProvider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <div className="App">
          <AccountProvider>
            {children}
          </AccountProvider>
        </div>
      </body>
    </html>
  )
}