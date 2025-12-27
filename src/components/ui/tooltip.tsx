import * as React from "react"
import { View, Text, TouchableOpacity } from "react-native"

const TooltipProvider = ({ children }: any) => <>{children}</>

const Tooltip = ({ children }: any) => <View>{children}</View>

const TooltipTrigger = ({ asChild, children }: any) => <>{children}</>

const TooltipContent = ({ children }: any) => null // Tooltips on click/touch don't work great without specific interaction. Hidden for now.

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
